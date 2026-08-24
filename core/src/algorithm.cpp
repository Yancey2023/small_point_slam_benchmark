#include "slam_benchmark/algorithm.hpp"

#include <algorithm>
#include <array>

namespace slam_benchmark {
namespace {

const char* sensor_name(SensorType type) {
    switch (type) {
        case SensorType::Lidar: return "LiDAR";
        case SensorType::Imu: return "IMU";
        case SensorType::Camera: return "相机";
        case SensorType::Gnss: return "GNSS/GPS";
        case SensorType::WheelSpeed: return "轮速";
    }
    return "未知传感器";
}

InitializationResult require_sensor(std::span<const SensorDefinition> sensors,
                                    SensorType type) {
    const auto available = std::ranges::find_if(sensors, [type](const auto& sensor) {
        return sensor.type == type && sensor.available;
    });
    if (available != sensors.end()) return {};

    const auto declared = std::ranges::find(sensors, type, &SensorDefinition::type);
    if (declared != sensors.end() && !declared->availability_reason.empty())
        return InitializationResult::unsupported(declared->availability_reason);
    return InitializationResult::unsupported(
        std::string("数据集没有可用的 ") + sensor_name(type) + " 数据");
}

}  // namespace

InitializationResult check_dataset_compatibility(
    std::span<const SensorDefinition> sensors,
    const DatasetRequirements& requirements) {
    constexpr std::array sensor_requirements{
        &DatasetRequirements::lidar,
        &DatasetRequirements::imu,
        &DatasetRequirements::camera,
        &DatasetRequirements::gnss,
        &DatasetRequirements::wheel_speed,
    };
    constexpr std::array sensor_types{
        SensorType::Lidar,
        SensorType::Imu,
        SensorType::Camera,
        SensorType::Gnss,
        SensorType::WheelSpeed,
    };
    for (std::size_t index = 0; index < sensor_types.size(); ++index) {
        if (!(requirements.*sensor_requirements[index])) continue;
        auto result = require_sensor(sensors, sensor_types[index]);
        if (!result) return result;
    }

    const auto lidar = std::ranges::find_if(sensors, [](const auto& sensor) {
        return sensor.type == SensorType::Lidar && sensor.available;
    });
    if (requirements.point_time &&
        (lidar == sensors.end() || !lidar->provides_point_time)) {
        return InitializationResult::unsupported(
            "点云没有逐点时间，无法进行扫描去畸变");
    }
    if (requirements.intensity &&
        (lidar == sensors.end() || !lidar->provides_intensity)) {
        return InitializationResult::unsupported(
            "点云没有强度，当前算法无法建立强度观测");
    }
    return {};
}

}  // namespace slam_benchmark
