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

const SensorDefinition* preferred_sensor(std::span<const SensorDefinition> sensors,
                                         SensorType type,
                                         const DatasetRequirements& requirements) {
    const SensorDefinition* preferred = nullptr;
    for (const auto& sensor : sensors) {
        if (sensor.type != type || !sensor.enabled || !sensor.available) continue;
        if (type == SensorType::Lidar && requirements.point_time &&
            !sensor.provides_point_time) continue;
        if (type == SensorType::Lidar && requirements.intensity &&
            !sensor.provides_intensity) continue;
        if (preferred == nullptr || sensor.priority > preferred->priority)
            preferred = &sensor;
    }
    return preferred;
}

std::vector<const SensorDefinition*> compatible_sensors(
    std::span<const SensorDefinition> sensors, SensorType type,
    const DatasetRequirements& requirements) {
    std::vector<const SensorDefinition*> compatible;
    for (const auto& sensor : sensors) {
        if (sensor.type != type || !sensor.enabled || !sensor.available) continue;
        if (type == SensorType::Lidar && requirements.point_time &&
            !sensor.provides_point_time) continue;
        if (type == SensorType::Lidar && requirements.intensity &&
            !sensor.provides_intensity) continue;
        compatible.push_back(&sensor);
    }
    std::stable_sort(compatible.begin(), compatible.end(), [](const auto* left,
                                                               const auto* right) {
        return left->priority > right->priority;
    });
    return compatible;
}

InitializationResult missing_sensor(std::span<const SensorDefinition> sensors,
                                    SensorType type,
                                    const DatasetRequirements& requirements) {
    const auto available = preferred_sensor(sensors, type, requirements);
    if (available != nullptr) return {};

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
    InitializationResult result;
    constexpr std::array sensor_types{
        SensorType::Lidar,
        SensorType::Imu,
        SensorType::Camera,
        SensorType::Gnss,
        SensorType::WheelSpeed,
    };
    for (std::size_t index = 0; index < sensor_types.size(); ++index) {
        const bool required =
            index == 0
                ? requirements.lidar || requirements.point_time || requirements.intensity
                : index == 1 ? requirements.imu
                : index == 2 ? requirements.camera
                : index == 3 ? requirements.gnss
                             : requirements.wheel_speed;
        const bool optional =
            index == 1 ? requirements.optional_imu
            : index == 2 ? requirements.optional_camera
            : index == 3 ? requirements.optional_gnss
                         : index == 4 && requirements.optional_wheel_speed;
        if (!required && !optional) continue;
        const auto selected = compatible_sensors(sensors, sensor_types[index], requirements);
        if (selected.empty()) {
            if (optional) continue;
            if (sensor_types[index] == SensorType::Lidar) {
                const auto has_available_lidar = [&](auto predicate) {
                    return std::ranges::any_of(
                        sensors, [&](const SensorDefinition& sensor) {
                            return sensor.type == SensorType::Lidar && sensor.enabled &&
                                   sensor.available &&
                                   predicate(sensor);
                        });
                };
                if (requirements.point_time &&
                    !has_available_lidar([](const SensorDefinition& sensor) {
                        return sensor.provides_point_time;
                    })) {
                    return InitializationResult::unsupported(
                        "点云没有逐点时间，无法进行扫描去畸变");
                }
                if (requirements.intensity &&
                    !has_available_lidar([&](const SensorDefinition& sensor) {
                        return (!requirements.point_time || sensor.provides_point_time) &&
                               sensor.provides_intensity;
                    })) {
                    return InitializationResult::unsupported(
                        "点云没有强度，当前算法无法建立强度观测");
                }
            }
            return missing_sensor(sensors, sensor_types[index], requirements);
        }
        if ((sensor_types[index] == SensorType::Lidar && requirements.all_lidars) ||
            (sensor_types[index] == SensorType::Gnss && requirements.all_gnss)) {
            for (const auto* sensor : selected) {
                result.selected_sensor_ids.push_back(sensor->id);
            }
        } else {
            result.selected_sensor_ids.push_back(selected.front()->id);
        }
    }

    return result;
}

}  // namespace slam_benchmark
