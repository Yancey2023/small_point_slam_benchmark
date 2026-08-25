#include "slam_benchmark/benchmark_runner.hpp"
#include "slam_benchmark/dataset_manifest.hpp"

#include <filesystem>
#include <fstream>
#include <chrono>
#include <stdexcept>

using namespace slam_benchmark;

void expect(bool condition) {
    if (!condition) throw std::runtime_error("core smoke test expectation failed");
}

class OneSampleReader final : public DatasetReader {
public:
    void read(const BagDefinition&, const SampleCallback& callback) override {
        callback(SensorSample{7, 42, ImuSample{}});
    }
};

class RealtimeReader final : public DatasetReader {
public:
    void read(const BagDefinition&, const SampleCallback& callback) override {
        callback(SensorSample{7, 1000000, ImuSample{}});
        callback(SensorSample{7, 21000000, ImuSample{}});
    }
};

class SensorSelectionReader final : public DatasetReader {
public:
    void read(const BagDefinition& bag, const SampleCallback&) override {
        for (const auto& sensor : bag.sensors) selected_ids.push_back(sensor.id);
    }
    std::vector<SensorId> selected_ids;
};

class ImuOnlyAlgorithm final : public SlamAlgorithm {
public:
    std::string_view name() const noexcept override { return "imu-only"; }
    InitializationResult initialize(std::span<const SensorDefinition> sensors,
                                    const std::filesystem::path&,
                                    ResultSink&) override {
        return check_dataset_compatibility(sensors, {.imu = true});
    }
    void process(const SensorSample&) override {}
    void finalize() override {}
};

class EchoAlgorithm final : public SlamAlgorithm {
public:
    std::string_view name() const noexcept override { return "echo"; }
    InitializationResult initialize(std::span<const SensorDefinition> sensors,
                                    const std::filesystem::path&,
                                    ResultSink& sink) override {
        expect(sensors.size() == 1);
        sink_ = &sink;
        return {};
    }
    void process(const SensorSample& sample) override {
        sink_->report_realtime_pose(Pose{sample.timestamp_ns});
        sink_->report_timing({sample.timestamp_ns, "imu_preprocess", 0.25});
        trajectory_.push_back(Pose{sample.timestamp_ns});
    }
    void finalize() override { sink_->report_final_trajectory(trajectory_); }
private:
    ResultSink* sink_{};
    Trajectory trajectory_;
};

class UnsupportedAlgorithm final : public SlamAlgorithm {
public:
    std::string_view name() const noexcept override { return "unsupported"; }
    InitializationResult initialize(std::span<const SensorDefinition>,
                                    const std::filesystem::path&,
                                    ResultSink&) override {
        return InitializationResult::unsupported("缺少测试传感器");
    }
    void process(const SensorSample&) override {
        throw std::runtime_error("unsupported algorithm must not process samples");
    }
    void finalize() override {
        throw std::runtime_error("unsupported algorithm must not finalize");
    }
};

class DivergingAlgorithm final : public SlamAlgorithm {
public:
    std::string_view name() const noexcept override { return "diverging"; }
    InitializationResult initialize(std::span<const SensorDefinition>,
                                    const std::filesystem::path&,
                                    ResultSink& sink) override {
        sink_ = &sink;
        return {};
    }
    void process(const SensorSample& sample) override {
        sink_->report_realtime_pose(Pose{sample.timestamp_ns, {2000.1, 0.0, 0.0}});
    }
    void finalize() override { finalized_ = true; }
    [[nodiscard]] bool finalized() const noexcept { return finalized_; }
private:
    ResultSink* sink_{};
    bool finalized_{};
};

int main() {
    SensorDefinition lidar;
    lidar.type = SensorType::Lidar;
    lidar.provides_point_time = false;
    lidar.provides_intensity = false;
    expect(!check_dataset_compatibility(
        std::span<const SensorDefinition>(&lidar, 1),
        {.lidar = true, .point_time = true}));
    expect(!check_dataset_compatibility(
        std::span<const SensorDefinition>(&lidar, 1),
        {.lidar = true, .intensity = true}));
    expect(!check_dataset_compatibility(
        std::span<const SensorDefinition>(&lidar, 1), {.gnss = true}));

    SensorDefinition preferred_lidar;
    preferred_lidar.id = 11;
    preferred_lidar.name = "preferred but no intensity";
    preferred_lidar.type = SensorType::Lidar;
    preferred_lidar.priority = 100;
    preferred_lidar.provides_point_time = true;
    preferred_lidar.provides_intensity = false;
    SensorDefinition compatible_lidar = preferred_lidar;
    compatible_lidar.id = 12;
    compatible_lidar.name = "compatible fallback";
    compatible_lidar.priority = 90;
    compatible_lidar.provides_intensity = true;
    SensorDefinition low_priority_imu;
    low_priority_imu.id = 20;
    low_priority_imu.type = SensorType::Imu;
    low_priority_imu.priority = 10;
    SensorDefinition high_priority_imu = low_priority_imu;
    high_priority_imu.id = 21;
    high_priority_imu.priority = 100;
    SensorDefinition disabled_imu = high_priority_imu;
    disabled_imu.id = 22;
    disabled_imu.priority = 1000;
    disabled_imu.enabled = false;
    const std::vector multi_sensors{
        preferred_lidar, low_priority_imu, compatible_lidar, high_priority_imu,
        disabled_imu};
    const auto compatible_selection = check_dataset_compatibility(
        multi_sensors, {.lidar = true, .imu = true, .point_time = true,
                        .intensity = true});
    expect(static_cast<bool>(compatible_selection));
    expect(compatible_selection.selected_sensor_ids ==
           std::vector<SensorId>({12, 21}));
    expect(compatible_selection.selected_sensor(multi_sensors, SensorType::Lidar)->id == 12);

    SensorDefinition second_lidar = compatible_lidar;
    second_lidar.id = 13;
    second_lidar.priority = 80;
    const std::vector generalized_sensors{
        preferred_lidar, low_priority_imu, compatible_lidar, high_priority_imu,
        second_lidar};
    const auto generalized_selection = check_dataset_compatibility(
        generalized_sensors,
        {.lidar = true, .point_time = true, .all_lidars = true,
         .optional_imu = true, .optional_camera = true,
         .optional_wheel_speed = true});
    expect(static_cast<bool>(generalized_selection));
    expect(generalized_selection.selected_sensor_ids ==
           std::vector<SensorId>({11, 12, 13, 21}));
    expect(generalized_selection.sensor_selected(13));
    expect(!generalized_selection.sensor_selected(20));

    SensorDefinition gnss_fix;
    gnss_fix.id = 30;
    gnss_fix.type = SensorType::Gnss;
    gnss_fix.priority = 100;
    SensorDefinition gnss_observations = gnss_fix;
    gnss_observations.id = 31;
    gnss_observations.priority = 90;
    const std::array gnss_bundle{gnss_observations, gnss_fix};
    const auto gnss_bundle_selection = check_dataset_compatibility(
        gnss_bundle, {.gnss = true, .all_gnss = true});
    expect(gnss_bundle_selection.selected_sensor_ids ==
           std::vector<SensorId>({30, 31}));

    const std::array lidar_only_sensors{compatible_lidar};
    const auto optional_absent = check_dataset_compatibility(
        lidar_only_sensors,
        {.lidar = true, .all_lidars = true, .optional_imu = true,
         .optional_camera = true, .optional_wheel_speed = true});
    expect(static_cast<bool>(optional_absent));
    expect(optional_absent.selected_sensor_ids == std::vector<SensorId>({12}));

    const auto output = std::filesystem::temp_directory_path() / "slam_benchmark_core_test";
    std::filesystem::remove_all(output);
    SensorDefinition unit_imu;
    unit_imu.id = 7;
    unit_imu.name = "imu";
    unit_imu.type = SensorType::Imu;
    BagDefinition bag{"unit", {}, {unit_imu}};
    OneSampleReader reader;
    EchoAlgorithm algorithm;
    BenchmarkSummary summary;
    {
        BenchmarkRunner runner({output, std::chrono::milliseconds{0}});
        summary = runner.run(algorithm, reader, bag, "unused.yaml");
    }
    expect(summary.message_count == 1);
    expect(summary.algorithm_cpu_time_ms >= 0.0);
    expect(summary.mean_memory_mb > 0.0);
    expect(summary.peak_memory_mb >= summary.mean_memory_mb);
    expect(std::filesystem::exists(output / "timings.csv"));
    expect(std::filesystem::exists(output / "final_trajectory.csv"));
    std::ifstream resource_csv(output / "cpu.csv");
    std::string resource_header;
    std::getline(resource_csv, resource_header);
    expect(resource_header ==
           "elapsed_ms,core_percent,normalized_percent,resident_memory_mb");
    std::ifstream summary_csv(output / "summary.csv");
    std::string summary_header;
    std::getline(summary_csv, summary_header);
    expect(summary_header ==
           "message_count,wall_time_ms,algorithm_process_time_ms,algorithm_cpu_time_ms,"
           "mean_cpu_normalized_percent,mean_memory_mb,peak_memory_mb,run_mode,status,reason");

    UnsupportedAlgorithm unsupported_algorithm;
    BenchmarkRunner unsupported_runner(
        {output / "unsupported", std::chrono::milliseconds{0}});
    const auto unsupported =
        unsupported_runner.run(unsupported_algorithm, reader, bag, "unused.yaml");
    expect(!unsupported.initialization.compatible);
    expect(unsupported.initialization.reason == "缺少测试传感器");
    expect(unsupported.message_count == 0);

    DivergingAlgorithm diverging_algorithm;
    const auto diverging_output = output / "diverging";
    BenchmarkSummary diverging;
    {
        BenchmarkRunner diverging_runner(
            {diverging_output, std::chrono::milliseconds{0}});
        diverging = diverging_runner.run(
            diverging_algorithm, reader, bag, "unused.yaml");
    }
    expect(diverging.failed);
    expect(diverging.failure_reason == "输出位置超过 2000.0 m，算法判定失败");
    expect(!diverging_algorithm.finalized());
    std::ifstream diverging_trajectory(diverging_output / "realtime_pose.csv");
    std::string diverging_header;
    std::string diverging_pose;
    std::getline(diverging_trajectory, diverging_header);
    expect(!std::getline(diverging_trajectory, diverging_pose));
    std::ifstream diverging_summary(diverging_output / "summary.csv");
    std::string diverging_summary_header;
    std::string diverging_summary_row;
    std::getline(diverging_summary, diverging_summary_header);
    std::getline(diverging_summary, diverging_summary_row);
    expect(diverging_summary_row.find(",failed,输出位置超过 2000.0 m，算法判定失败") !=
           std::string::npos);

    DivergingAlgorithm tight_limit_algorithm;
    BagDefinition tight_bag = bag;
    tight_bag.name = "tight_limit";
    tight_bag.max_output_position_m = 1.0;
    const auto tight_output = output / "diverging_tight";
    BenchmarkSummary tight_summary;
    {
        BenchmarkRunner tight_runner({tight_output, std::chrono::milliseconds{0}});
        tight_summary = tight_runner.run(
            tight_limit_algorithm, reader, tight_bag, "unused.yaml");
    }
    expect(tight_summary.failed);
    expect(tight_summary.failure_reason == "输出位置超过 1.0 m，算法判定失败");

    SensorDefinition backup_imu = unit_imu;
    backup_imu.id = 8;
    backup_imu.priority = 10;
    SensorDefinition primary_imu = unit_imu;
    primary_imu.id = 9;
    primary_imu.priority = 100;
    BagDefinition selection_bag{"selection", {}, {backup_imu, primary_imu}};
    SensorSelectionReader selection_reader;
    ImuOnlyAlgorithm imu_only_algorithm;
    BenchmarkRunner selection_runner(
        {output / "selection", std::chrono::milliseconds{0}});
    const auto selection_summary = selection_runner.run(
        imu_only_algorithm, selection_reader, selection_bag, "unused.yaml");
    expect(static_cast<bool>(selection_summary.initialization));
    expect(selection_reader.selected_ids == std::vector<SensorId>({9}));

    RealtimeReader realtime_reader;
    EchoAlgorithm realtime_algorithm;
    BenchmarkRunner realtime_runner(
        {output / "realtime", std::chrono::milliseconds{0}, RunMode::Realtime});
    const auto started = std::chrono::steady_clock::now();
    realtime_runner.run(realtime_algorithm, realtime_reader, bag, "unused.yaml");
    const auto elapsed = std::chrono::steady_clock::now() - started;
    expect(elapsed >= std::chrono::milliseconds{18});
    std::filesystem::remove_all(output);
}
