#pragma once

#include "slam_benchmark/algorithm.hpp"
#include "slam_benchmark/dataset_reader.hpp"
#include "slam_benchmark/process_monitor.hpp"

#include <chrono>
#include <filesystem>
#include <memory>

namespace slam_benchmark {

enum class RunMode { FullSpeed, Realtime };

[[nodiscard]] constexpr const char* to_string(RunMode mode) noexcept {
    return mode == RunMode::Realtime ? "realtime" : "full_speed";
}

struct BenchmarkOptions {
    std::filesystem::path output_directory;
    std::chrono::milliseconds cpu_sample_period{100};
    RunMode run_mode{RunMode::FullSpeed};
};

struct BenchmarkSummary {
    std::uint64_t message_count{};
    double wall_time_ms{};
    double algorithm_process_time_ms{};
    double mean_cpu_normalized_percent{};
    double mean_memory_mb{};
    double peak_memory_mb{};
};

class BenchmarkRunner final : public ResultSink {
public:
    explicit BenchmarkRunner(BenchmarkOptions options);
    ~BenchmarkRunner() override;
    BenchmarkRunner(const BenchmarkRunner&) = delete;
    BenchmarkRunner& operator=(const BenchmarkRunner&) = delete;

    BenchmarkSummary run(SlamAlgorithm& algorithm,
                         DatasetReader& reader,
                         const BagDefinition& bag,
                         const std::filesystem::path& algorithm_config);

    void report_realtime_pose(const Pose& pose) override;
    void report_final_trajectory(std::span<const Pose> trajectory) override;
    void report_timing(const TimingSample& timing) override;

private:
    class Impl;
    std::unique_ptr<Impl> impl_;
};

}  // namespace slam_benchmark
