#pragma once

#include "slam_benchmark/types.hpp"

#include <span>
#include <filesystem>
#include <string_view>

namespace slam_benchmark {

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
    virtual void initialize(std::span<const SensorDefinition> sensors,
                            const std::filesystem::path& config_path,
                            ResultSink& sink) = 0;
    virtual void process(const SensorSample& sample) = 0;
    virtual void finalize() = 0;
};

}  // namespace slam_benchmark
