#pragma once

#include "slam_benchmark/types.hpp"

#include <algorithm>
#include <filesystem>
#include <span>
#include <string>
#include <string_view>
#include <utility>

namespace slam_benchmark {

struct InitializationResult {
    bool compatible{true};
    std::string reason;
    std::vector<SensorId> selected_sensor_ids;

    [[nodiscard]] static InitializationResult unsupported(std::string reason) {
        return {false, std::move(reason), {}};
    }
    [[nodiscard]] explicit operator bool() const noexcept { return compatible; }
    [[nodiscard]] bool sensor_selected(SensorId id) const noexcept {
        return std::ranges::find(selected_sensor_ids, id) != selected_sensor_ids.end();
    }
    // Returns the sensor selected by the common compatibility check for this
    // sensor type, or sensors.end() when that type was not requested.
    [[nodiscard]] std::span<const SensorDefinition>::iterator selected_sensor(
        std::span<const SensorDefinition> sensors, SensorType type) const {
        return std::ranges::find_if(sensors, [&](const SensorDefinition& sensor) {
            return sensor.type == type &&
                   std::ranges::find(selected_sensor_ids, sensor.id) !=
                       selected_sensor_ids.end();
        });
    }
};

struct DatasetRequirements {
    bool lidar{};
    bool imu{};
    bool camera{};
    bool gnss{};
    bool wheel_speed{};
    bool point_time{};
    bool intensity{};
    // Select every compatible LiDAR, in descending dataset priority order.
    // Other sensor types intentionally remain single-source.
    bool all_lidars{};
    bool all_gnss{};
    bool optional_imu{};
    bool optional_camera{};
    bool optional_gnss{};
    bool optional_wheel_speed{};
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
