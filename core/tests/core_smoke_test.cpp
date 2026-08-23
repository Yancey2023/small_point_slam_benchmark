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

class EchoAlgorithm final : public SlamAlgorithm {
public:
    std::string_view name() const noexcept override { return "echo"; }
    void initialize(std::span<const SensorDefinition> sensors,
                    const std::filesystem::path&,
                    ResultSink& sink) override {
        expect(sensors.size() == 1);
        sink_ = &sink;
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

int main() {
    const auto output = std::filesystem::temp_directory_path() / "slam_benchmark_core_test";
    std::filesystem::remove_all(output);
    BagDefinition bag{"unit", {}, {{7, "imu", SensorType::Imu, "/imu"}}};
    OneSampleReader reader;
    EchoAlgorithm algorithm;
    BenchmarkSummary summary;
    {
        BenchmarkRunner runner({output, std::chrono::milliseconds{0}});
        summary = runner.run(algorithm, reader, bag, "unused.yaml");
    }
    expect(summary.message_count == 1);
    expect(summary.mean_memory_mb > 0.0);
    expect(summary.peak_memory_mb >= summary.mean_memory_mb);
    expect(std::filesystem::exists(output / "timings.csv"));
    expect(std::filesystem::exists(output / "final_trajectory.csv"));
    std::ifstream resource_csv(output / "cpu.csv");
    std::string resource_header;
    std::getline(resource_csv, resource_header);
    expect(resource_header ==
           "elapsed_ms,core_percent,normalized_percent,resident_memory_mb");

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
