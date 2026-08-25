#include "slam_benchmark/dataset_manifest.hpp"

#include <yaml-cpp/yaml.h>

#include <algorithm>
#include <cmath>
#include <numbers>
#include <set>
#include <stdexcept>
#include <string_view>

namespace slam_benchmark {
namespace {

SensorType parse_sensor_type(const std::string& value) {
    if (value == "lidar") return SensorType::Lidar;
    if (value == "imu") return SensorType::Imu;
    if (value == "camera") return SensorType::Camera;
    if (value == "gnss") return SensorType::Gnss;
    if (value == "wheel_speed") return SensorType::WheelSpeed;
    throw std::runtime_error("unsupported sensor type: " + value);
}

template <std::size_t Size>
std::array<double, Size> fixed_array(const YAML::Node& node,
                                     const std::array<double, Size>& fallback,
                                     std::string_view field) {
    if (!node) return fallback;
    if (!node.IsSequence() || node.size() != Size) {
        throw std::runtime_error(std::string(field) + " must contain " +
                                 std::to_string(Size) + " numbers");
    }
    std::array<double, Size> result{};
    for (std::size_t i = 0; i < Size; ++i) result[i] = node[i].as<double>();
    return result;
}

double unit_scale(const YAML::Node& units,
                  std::string_view key,
                  std::string_view fallback) {
    const auto value = units && units[std::string(key)]
                           ? units[std::string(key)].as<std::string>()
                           : std::string(fallback);
    if (key == "point_time") {
        if (value == "ns") return 1.0;
        if (value == "us") return 1e3;
        if (value == "ms") return 1e6;
        if (value == "s") return 1e9;
    } else if (key == "distance") {
        if (value == "m") return 1.0;
        if (value == "cm") return 1e-2;
        if (value == "mm") return 1e-3;
    } else if (key == "angular_velocity") {
        if (value == "rad/s") return 1.0;
        if (value == "deg/s") return std::numbers::pi / 180.0;
    } else if (key == "acceleration") {
        if (value == "m/s^2") return 1.0;
        if (value == "g") return 9.80665;
    }
    throw std::runtime_error("unsupported unit for " + std::string(key) + ": " + value);
}

SensorDefinition parse_sensor(const YAML::Node& node) {
    SensorDefinition sensor;
    sensor.id = node["id"].as<SensorId>();
    sensor.name = node["name"].as<std::string>();
    sensor.type = parse_sensor_type(node["type"].as<std::string>());
    sensor.enabled = node["enabled"].as<bool>(true);
    sensor.available = sensor.enabled;
    if (!sensor.enabled) sensor.availability_reason = "传感器已在 manifest 中禁用";
    sensor.priority = node["priority"].as<int>(0);
    sensor.point_time_field = node["point_time_field"].as<std::string>("time");
    sensor.intensity_field = node["intensity_field"].as<std::string>("intensity");

    const auto calibration = node["calibration"];
    sensor.calibration.body_from_sensor = fixed_array<16>(
        calibration ? calibration["body_from_sensor"] : YAML::Node{},
        sensor.calibration.body_from_sensor,
        "calibration.body_from_sensor");
    if (calibration && calibration["intrinsics"])
        sensor.calibration.intrinsics = calibration["intrinsics"].as<std::vector<double>>();
    if (calibration && calibration["distortion"])
        sensor.calibration.distortion = calibration["distortion"].as<std::vector<double>>();
    if (calibration && calibration["resolution"]) {
        const auto resolution = fixed_array<2>(
            calibration["resolution"], std::array<double, 2>{},
            "calibration.resolution");
        if (resolution[0] <= 0 || resolution[1] <= 0)
            throw std::runtime_error("calibration.resolution must be positive");
        sensor.calibration.image_width = static_cast<std::uint32_t>(resolution[0]);
        sensor.calibration.image_height = static_cast<std::uint32_t>(resolution[1]);
    }

    const auto units = node["units"];
    sensor.point_time_to_nanoseconds = unit_scale(units, "point_time", "ns");
    sensor.distance_to_meters = unit_scale(units, "distance", "m");
    sensor.angular_velocity_to_rad_per_second =
        unit_scale(units, "angular_velocity", "rad/s");
    sensor.acceleration_to_meters_per_second_squared =
        unit_scale(units, "acceleration", "m/s^2");
    return sensor;
}

}  // namespace

DatasetManifest load_dataset_manifest(const std::filesystem::path& path) {
    const YAML::Node root = YAML::LoadFile(path.string());
    DatasetManifest manifest;
    manifest.manifest_path = std::filesystem::absolute(path);
    manifest.name = root["name"].as<std::string>();
    manifest.description = root["description"].as<std::string>("");
    manifest.download_url = root["download_url"].as<std::string>("");

    const auto bags = root["bags"];
    if (!bags || !bags.IsSequence() || bags.size() == 0)
        throw std::runtime_error("dataset manifest must contain at least one bag");

    std::set<std::string> bag_names;
    for (const auto& bag_node : bags) {
        BagDefinition bag;
        bag.name = bag_node["name"].as<std::string>();
        if (!bag_names.insert(bag.name).second)
            throw std::runtime_error("duplicate bag name: " + bag.name);
        bag.path = bag_node["path"].as<std::string>();
        if (bag.path.is_relative()) bag.path = path.parent_path() / bag.path;
        bag.path = bag.path.lexically_normal();
        bag.max_output_position_m =
            bag_node["max_output_position_m"].as<double>(kDefaultMaxOutputPositionMeters);
        if (!std::isfinite(bag.max_output_position_m) || bag.max_output_position_m <= 0.0)
            throw std::runtime_error("bag " + bag.name +
                                     " max_output_position_m must be a positive number");

        std::set<SensorId> ids;
        std::set<std::string> topics;
        const auto sensors = bag_node["sensors"];
        if (!sensors || !sensors.IsSequence() || sensors.size() == 0)
            throw std::runtime_error("bag " + bag.name + " has no sensors");
        for (const auto& sensor_node : sensors) {
            auto sensor = parse_sensor(sensor_node);
            const auto topic = sensor_node["topic"].as<std::string>();
            const auto message_type = sensor_node["message_type"].as<std::string>();
            if (!ids.insert(sensor.id).second)
                throw std::runtime_error("duplicate sensor id in bag " + bag.name);
            if (!topics.insert(topic).second)
                throw std::runtime_error("duplicate sensor topic in bag " + bag.name);
            bag.sensor_inputs.emplace(
                sensor.id, SensorInputBinding{topic, message_type});
            bag.sensors.push_back(std::move(sensor));
        }
        manifest.bags.push_back(std::move(bag));
    }
    return manifest;
}

const BagDefinition& find_bag(const DatasetManifest& manifest, const std::string& bag_name) {
    for (const auto& bag : manifest.bags) {
        if (bag.name == bag_name) return bag;
    }
    throw std::runtime_error("bag not found: " + bag_name);
}

}  // namespace slam_benchmark
