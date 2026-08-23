#pragma once

#include "slam_benchmark/types.hpp"

#include <filesystem>
#include <string>
#include <vector>

namespace slam_benchmark {

struct BagDefinition {
    std::string name;
    std::filesystem::path path;
    std::vector<SensorDefinition> sensors;
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

