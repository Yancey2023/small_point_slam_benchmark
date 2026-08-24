#pragma once

#include "slam_benchmark/types.hpp"

#include <filesystem>
#include <span>
#include <string>
#include <string_view>
#include <utility>

namespace slam_benchmark {

struct InitializationResult {
    bool compatible{true};
    std::string reason;

    [[nodiscard]] static InitializationResult unsupported(std::string reason) {
        return {false, std::move(reason)};
    }
    [[nodiscard]] explicit operator bool() const noexcept { return compatible; }
};

struct DatasetRequirements {
    bool lidar{};
    bool imu{};
    bool camera{};
    bool gnss{};
    bool wheel_speed{};
    bool point_time{};
    bool intensity{};
};

[[nodiscard]] InitializationResult check_dataset_compatibility(
    std::span<const SensorDefinition> sensors,
    const DatasetRequirements& requirements);

class ResultSink {
public:
    virtual ~ResultSink() = default;
    virtual void report_realtime_pose(const Pose& pose) = 0;
    virtual void report_final_trajectory(std::span<const Pose> trajectory) = 0;
    virtual void report_timing(const TimingSample& timing) = 0;
};

class SlamAlgorithm {
public:
    virtual ~SlamAlgorithm() = default;
    [[nodiscard]] virtual std::string_view name() const noexcept = 0;
    // The adapter reads this file with yaml-cpp, keeping algorithm-specific options
    // outside the common layer.
    [[nodiscard]] virtual InitializationResult initialize(
        std::span<const SensorDefinition> sensors,
        const std::filesystem::path& config_path,
        ResultSink& sink) = 0;
    virtual void process(const SensorSample& sample) = 0;
    virtual void finalize() = 0;
};

}  // namespace slam_benchmark
