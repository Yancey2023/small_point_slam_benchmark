#pragma once

#include "slam_benchmark/types.hpp"

#include <filesystem>
#include <map>
#include <string>
#include <vector>

namespace slam_benchmark {

// Default per-bag output limit. Output poses farther than this from the origin
// fail the run; individual bags can override it in the manifest.
inline constexpr double kDefaultMaxOutputPositionMeters{2000.0};

struct SensorInputBinding {
    std::string topic;
    std::string message_type;
};

struct BagDefinition {
    std::string name;
    std::filesystem::path path;
    std::vector<SensorDefinition> sensors;
    // Dataset transport binding. This remains inside the core and is never
    // exposed through SlamAlgorithm::initialize or SensorSample.
    std::map<SensorId, SensorInputBinding> sensor_inputs;
    double max_output_position_m{kDefaultMaxOutputPositionMeters};
};

struct DatasetManifest {
    std::string name;
    std::string description;
    std::string download_url;
    std::filesystem::path manifest_path;
    std::vector<BagDefinition> bags;
};

[[nodiscard]] DatasetManifest load_dataset_manifest(const std::filesystem::path& path);
[[nodiscard]] const BagDefinition& find_bag(const DatasetManifest& manifest,
                                            const std::string& bag_name);

}  // namespace slam_benchmark
