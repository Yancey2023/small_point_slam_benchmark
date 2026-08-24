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
    sensors:
      - id: 9
        name: lidar
        type: lidar
        topic: /points
        message_type: sensor_msgs/msg/PointCloud2
        point_time_field: t
        intensity_field: reflectivity
        units: {point_time: us, distance: mm}
        calibration:
          body_from_sensor: [1, 0, 0, 1, 0, 1, 0, 2, 0, 0, 1, 3, 0, 0, 0, 1]
)yaml";
    output.close();

    const auto manifest = load_dataset_manifest(path);
    expect(manifest.name == "unit_dataset");
    const auto& bag = find_bag(manifest, "bag_a");
    expect(bag.path == (directory / "data/a.mcap").lexically_normal());
    expect(bag.sensors.size() == 1);
    expect(bag.sensors[0].point_time_to_nanoseconds == 1000.0);
    expect(bag.sensors[0].distance_to_meters == 0.001);
    expect(bag.sensors[0].intensity_field == "reflectivity");
    expect(bag.sensors[0].calibration.body_from_sensor[3] == 1.0);
    std::filesystem::remove(path);
    std::filesystem::remove(directory);
}
