#include "slam_benchmark/benchmark_runner.hpp"

#include "slam_benchmark/csv_writer.hpp"

#include <spdlog/spdlog.h>

#include <algorithm>
#include <chrono>
#include <iomanip>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <thread>

namespace slam_benchmark {
namespace {

std::string pose_row(const Pose& pose) {
    std::ostringstream out;
    out << std::setprecision(17) << pose.timestamp_ns;
    for (const double v : pose.translation_m) out << ',' << v;
    for (const double v : pose.rotation_xyzw) out << ',' << v;
    return out.str();
}

std::size_t payload_items(const SensorPayload& payload) {
    return std::visit([](const auto& value) -> std::size_t {
        using T = std::decay_t<decltype(value)>;
        if constexpr (std::is_same_v<T, PointCloud>) return value.points.size();
        if constexpr (std::is_same_v<T, ImageFrame>) return value.data.size();
        return 1;
    }, payload);
}

SensorType payload_type(const SensorPayload& payload) {
    return std::visit([](const auto& value) {
        using T = std::decay_t<decltype(value)>;
        if constexpr (std::is_same_v<T, PointCloud>) return SensorType::Lidar;
        if constexpr (std::is_same_v<T, ImuSample>) return SensorType::Imu;
        if constexpr (std::is_same_v<T, ImageFrame>) return SensorType::Camera;
        if constexpr (std::is_same_v<T, GnssFix>) return SensorType::Gnss;
        return SensorType::WheelSpeed;
    }, payload);
}

}  // namespace

class BenchmarkRunner::Impl {
public:
    explicit Impl(BenchmarkOptions value)
        : options(std::move(value)),
          message_csv(options.output_directory / "sensor_messages.csv",
                      "sensor_id,sensor_type,timestamp_ns,item_count"),
          realtime_pose_csv(options.output_directory / "realtime_pose.csv",
                            "timestamp_ns,x_m,y_m,z_m,qx,qy,qz,qw"),
          final_trajectory_csv(options.output_directory / "final_trajectory.csv",
                               "timestamp_ns,x_m,y_m,z_m,qx,qy,qz,qw"),
          timing_csv(options.output_directory / "timings.csv",
                     "timestamp_ns,stage,duration_ms"),
          cpu_csv(options.output_directory / "cpu.csv",
                  "elapsed_ms,core_percent,normalized_percent,resident_memory_mb"),
          summary_csv(options.output_directory / "summary.csv",
                      "message_count,wall_time_ms,algorithm_process_time_ms,"
                      "algorithm_cpu_time_ms,mean_cpu_normalized_percent,mean_memory_mb,"
                      "peak_memory_mb,run_mode,status,reason") {}

    BenchmarkOptions options;
    CsvWriter message_csv;
    CsvWriter realtime_pose_csv;
    CsvWriter final_trajectory_csv;
    CsvWriter timing_csv;
    CsvWriter cpu_csv;
    CsvWriter summary_csv;
};

BenchmarkRunner::BenchmarkRunner(BenchmarkOptions options)
    : impl_(std::make_unique<Impl>(std::move(options))) {}

BenchmarkRunner::~BenchmarkRunner() = default;

BenchmarkSummary BenchmarkRunner::run(SlamAlgorithm& algorithm,
                                      DatasetReader& reader,
                                      const BagDefinition& bag,
                                      const std::filesystem::path& algorithm_config) {
    BenchmarkSummary summary;
    const auto write_unsupported = [this](const InitializationResult& result) {
        std::ostringstream row;
        row << "0,0,0,0,0,0,0," << to_string(impl_->options.run_mode)
            << ",unsupported," << csv_escape(result.reason);
        impl_->summary_csv.row(row.str());
    };
    spdlog::info("checking whether {} can run on {}", algorithm.name(), bag.name);
    std::vector<SensorDefinition> inspected_sensors;
    try {
        inspected_sensors = reader.inspect(bag);
    } catch (const std::exception& error) {
        summary.initialization = InitializationResult::unsupported(
            std::string("无法检查数据集：") + error.what());
        write_unsupported(summary.initialization);
        spdlog::warn("skipping {} on {}: {}", algorithm.name(), bag.name,
                     summary.initialization.reason);
        return summary;
    }

    ProcessMonitor monitor;
    double cpu_sum = 0.0;
    double memory_sum = 0.0;
    double peak_memory_mb = 0.0;
    std::uint64_t cpu_count = 0;
    auto last_cpu_sample = std::chrono::steady_clock::now();
    const auto wall_start = last_cpu_sample;
    std::optional<TimestampNs> first_message_timestamp;
    std::chrono::steady_clock::time_point replay_start;

    auto available_sensors = inspected_sensors;
    std::erase_if(available_sensors,
                  [](const SensorDefinition& sensor) { return !sensor.available; });
    spdlog::info("initializing {} on {}", algorithm.name(), bag.name);
    summary.initialization =
        algorithm.initialize(available_sensors, algorithm_config, *this);
    if (!summary.initialization) {
        write_unsupported(summary.initialization);
        spdlog::warn("skipping {} on {}: {}", algorithm.name(), bag.name,
                     summary.initialization.reason);
        return summary;
    }

    BagDefinition inspected_bag = bag;
    inspected_bag.sensors = std::move(available_sensors);
    spdlog::info("running {} on {}", algorithm.name(), bag.name);
    reader.read(inspected_bag, [&](SensorSample&& sample) {
        if (impl_->options.run_mode == RunMode::Realtime) {
            if (!first_message_timestamp) {
                first_message_timestamp = sample.timestamp_ns;
                replay_start = std::chrono::steady_clock::now();
            }
            const TimestampNs relative_timestamp =
                sample.timestamp_ns >= *first_message_timestamp
                    ? sample.timestamp_ns - *first_message_timestamp
                    : 0;
            std::this_thread::sleep_until(
                replay_start + std::chrono::nanoseconds(relative_timestamp));
        }
        impl_->message_csv.row(std::to_string(sample.sensor_id) + ',' +
                               to_string(payload_type(sample.payload)) + ',' +
                               std::to_string(sample.timestamp_ns) + ',' +
                               std::to_string(payload_items(sample.payload)));

        const double process_cpu_start = ProcessMonitor::process_cpu_time_seconds();
        const auto process_start = std::chrono::steady_clock::now();
        algorithm.process(sample);
        const auto process_end = std::chrono::steady_clock::now();
        const double process_cpu_end = ProcessMonitor::process_cpu_time_seconds();
        const double duration_ms =
            std::chrono::duration<double, std::milli>(process_end - process_start).count();
        summary.algorithm_process_time_ms += duration_ms;
        summary.algorithm_cpu_time_ms +=
            1000.0 * std::max(0.0, process_cpu_end - process_cpu_start);
        ++summary.message_count;
        report_timing({sample.timestamp_ns, "total", duration_ms});

        if (process_end - last_cpu_sample >= impl_->options.cpu_sample_period) {
            const CpuUsage usage = monitor.sample();
            const double elapsed_ms =
                std::chrono::duration<double, std::milli>(process_end - wall_start).count();
            std::ostringstream row;
            row << std::setprecision(10) << elapsed_ms << ',' << usage.core_percent << ','
                << usage.normalized_percent << ',' << usage.resident_memory_mb;
            impl_->cpu_csv.row(row.str());
            cpu_sum += usage.normalized_percent;
            memory_sum += usage.resident_memory_mb;
            peak_memory_mb = std::max(peak_memory_mb, usage.resident_memory_mb);
            ++cpu_count;
            last_cpu_sample = process_end;
        }
    });

    const auto finalize_start = std::chrono::steady_clock::now();
    algorithm.finalize();
    const auto wall_end = std::chrono::steady_clock::now();
    report_timing({0, "finalize", std::chrono::duration<double, std::milli>(
                                      wall_end - finalize_start).count()});
    summary.wall_time_ms =
        std::chrono::duration<double, std::milli>(wall_end - wall_start).count();
    if (cpu_count == 0) {
        const CpuUsage usage = monitor.sample();
        std::ostringstream row;
        row << std::setprecision(10) << summary.wall_time_ms << ',' << usage.core_percent << ','
            << usage.normalized_percent << ',' << usage.resident_memory_mb;
        impl_->cpu_csv.row(row.str());
        cpu_sum = usage.normalized_percent;
        memory_sum = usage.resident_memory_mb;
        peak_memory_mb = usage.resident_memory_mb;
        cpu_count = 1;
    }
    summary.mean_cpu_normalized_percent = cpu_count == 0 ? 0.0 : cpu_sum / cpu_count;
    summary.mean_memory_mb = memory_sum / static_cast<double>(cpu_count);
    summary.peak_memory_mb = peak_memory_mb;

    std::ostringstream row;
    row << std::setprecision(10) << summary.message_count << ',' << summary.wall_time_ms << ','
        << summary.algorithm_process_time_ms << ',' << summary.algorithm_cpu_time_ms << ','
        << summary.mean_cpu_normalized_percent << ',' << summary.mean_memory_mb << ','
        << summary.peak_memory_mb << ','
        << to_string(impl_->options.run_mode) << ",completed,";
    impl_->summary_csv.row(row.str());
    spdlog::info("finished {} messages in {:.3f} ms", summary.message_count,
                 summary.wall_time_ms);
    return summary;
}

void BenchmarkRunner::report_realtime_pose(const Pose& pose) {
    impl_->realtime_pose_csv.row(pose_row(pose));
}

void BenchmarkRunner::report_final_trajectory(std::span<const Pose> trajectory) {
    for (const Pose& pose : trajectory) impl_->final_trajectory_csv.row(pose_row(pose));
}

void BenchmarkRunner::report_timing(const TimingSample& timing) {
    std::ostringstream row;
    row << std::setprecision(17) << timing.timestamp_ns << ',' << csv_escape(timing.stage) << ','
        << timing.duration_ms;
    impl_->timing_csv.row(row.str());
}

}  // namespace slam_benchmark
