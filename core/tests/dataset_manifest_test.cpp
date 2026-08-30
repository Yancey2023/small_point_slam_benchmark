#include "slam_benchmark/dataset_manifest.hpp"

#include <filesystem>
#include <fstream>
#include <stdexcept>

using namespace slam_benchmark;

void expect(bool condition) {
    if (!condition) throw std::runtime_error("manifest test expectation failed");
}

int main() {
    const auto directory =
        std::filesystem::temp_directory_path() / "slam_benchmark_manifest_test";
    std::filesystem::create_directories(directory);
    const auto path = directory / "manifest.yaml";
    std::ofstream output(path);
    output << R"yaml(
name: unit_dataset
download_url: https://example.invalid/unit
bags:
  - name: bag_a
    path: data/a.mcap
    max_output_position_m: 1500
    sensors:
      - id: 9
        name: lidar
        type: lidar
        enabled: true
        topic: /points
        message_type: sensor_msgs/msg/PointCloud2
        point_time_field: t
        intensity_field: reflectivity
        timestamp_offset_s: 0.1
        units: {point_time: us, distance: mm}
        calibration:
          body_from_sensor: [1, 0, 0, 1, 0, 1, 0, 2, 0, 0, 1, 3, 0, 0, 0, 1]
      - id: 10
        name: imu
        type: imu
        enabled: false
        topic: /imu
        message_type: sensor_msgs/msg/Imu
        units: {angular_velocity: rad/s, acceleration: g}
        calibration:
          body_from_sensor: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  - name: bag_b
    path: data/b.mcap
    sensors:
      - id: 9
        name: lidar
        type: lidar
        enabled: true
        topic: /points
        message_type: sensor_msgs/msg/PointCloud2
        calibration:
          body_from_sensor: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
)yaml";
    output.close();

    const auto manifest = load_dataset_manifest(path);
    expect(manifest.name == "unit_dataset");
    expect(manifest.bags.size() == 2);
    const auto& bag = find_bag(manifest, "bag_a");
    expect(bag.max_output_position_m == 1500.0);
    const auto& default_bag = find_bag(manifest, "bag_b");
    expect(default_bag.max_output_position_m == kDefaultMaxOutputPositionMeters);
    expect(default_bag.max_output_position_m == 2000.0);
    expect(bag.path == (directory / "data/a.mcap").lexically_normal());
    expect(bag.sensors.size() == 2);
    expect(bag.sensor_inputs.at(9).topic == "/points");
    expect(bag.sensor_inputs.at(9).message_type == "sensor_msgs/msg/PointCloud2");
    expect(bag.sensors[0].point_time_to_nanoseconds == 1000.0);
    expect(bag.sensors[0].distance_to_meters == 0.001);
    expect(bag.sensors[0].intensity_field == "reflectivity");
    expect(bag.sensors[0].timestamp_offset_ns == 100000000);
    expect(bag.sensors[0].calibration.body_from_sensor[3] == 1.0);
    expect(bag.sensors[0].enabled);
    expect(bag.sensors[0].available);
    expect(!bag.sensors[1].enabled);
    expect(!bag.sensors[1].available);
    expect(!bag.sensors[1].availability_reason.empty());
    expect(bag.sensors[1].angular_velocity_to_rad_per_second == 1.0);
    expect(bag.sensors[1].acceleration_to_meters_per_second_squared == 9.80665);
    std::filesystem::remove(path);

    const auto invalid_path = directory / "invalid_limit.yaml";
    {
        std::ofstream invalid_output(invalid_path);
        invalid_output << R"yaml(
name: invalid_dataset
download_url: https://example.invalid/invalid
bags:
  - name: bag_a
    path: data/a.mcap
    max_output_position_m: -5
    sensors:
      - id: 9
        name: lidar
        type: lidar
        topic: /points
        message_type: sensor_msgs/msg/PointCloud2
        calibration:
          body_from_sensor: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
)yaml";
    }
    bool rejected = false;
    try {
        load_dataset_manifest(invalid_path);
    } catch (const std::exception&) {
        rejected = true;
    }
    expect(rejected);
    std::filesystem::remove(invalid_path);
    std::filesystem::remove(directory);
}
