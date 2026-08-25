#include "slam_benchmark/application.hpp"

#include "slam_benchmark/benchmark_runner.hpp"
#include "slam_benchmark/dataset_manifest.hpp"
#include "slam_benchmark/dataset_reader.hpp"

#include <spdlog/spdlog.h>

#include <filesystem>
#include <iostream>
#include <map>
#include <stdexcept>
#include <string>
#include <string_view>

namespace slam_benchmark {
namespace {

std::map<std::string, std::string, std::less<>> parse_arguments(int argc, char** argv) {
    std::map<std::string, std::string, std::less<>> values;
    for (int index = 1; index < argc; index += 2) {
        if (index + 1 >= argc) throw std::invalid_argument("option has no value");
        std::string option = argv[index];
        if (!option.starts_with("--"))
            throw std::invalid_argument("expected an option, got: " + option);
        values.emplace(std::move(option), argv[index + 1]);
    }
    return values;
}

const std::string& required(const std::map<std::string, std::string, std::less<>>& values,
                            const std::string& key) {
    const auto it = values.find(key);
    if (it == values.end()) throw std::invalid_argument("missing required option: " + key);
    return it->second;
}

RunMode run_mode(const std::map<std::string, std::string, std::less<>>& values) {
    const auto it = values.find("--run-mode");
    if (it == values.end() || it->second == "full_speed") return RunMode::FullSpeed;
    if (it->second == "realtime") return RunMode::Realtime;
    throw std::invalid_argument("invalid --run-mode: " + it->second);
}

}  // namespace

int run_benchmark_main(int argc, char** argv, SlamAlgorithm& algorithm) {
    try {
        if (argc == 2 && std::string_view(argv[1]) == "--help") {
            std::cout << "Usage: " << argv[0]
                      << " --dataset-manifest <path> --bag <name> --config <path>"
                         " --output <directory> [--run-mode full_speed|realtime]\n";
            return 0;
        }
        const auto arguments = parse_arguments(argc, argv);
        const std::filesystem::path manifest_path = required(arguments, "--dataset-manifest");
        const std::filesystem::path config_path = required(arguments, "--config");
        const std::filesystem::path output_path = required(arguments, "--output");
        if (!std::filesystem::is_regular_file(config_path))
            throw std::runtime_error("algorithm config does not exist: " + config_path.string());

        const auto manifest = load_dataset_manifest(manifest_path);
        const std::string bag_name = required(arguments, "--bag");
        const BagDefinition* bag = &find_bag(manifest, bag_name);
#if defined(SLAM_BENCHMARK_HAS_ROSBAG_IO)
        RosbagDatasetReader reader;
        BenchmarkRunner runner({output_path, std::chrono::milliseconds{100},
                                run_mode(arguments)});
        const auto summary = runner.run(algorithm, reader, *bag, config_path);
        if (!summary.initialization) {
            spdlog::warn("dataset is not compatible with {}: {}", algorithm.name(),
                         summary.initialization.reason);
        }
        if (summary.failed) {
            spdlog::critical("benchmark failed: {}", summary.failure_reason);
            return 1;
        }
        return 0;
#else
        (void)algorithm;
        (void)bag;
        throw std::runtime_error("this build has no rosbag_io support");
#endif
    } catch (const std::exception& error) {
        spdlog::critical("benchmark failed: {}", error.what());
        return 1;
    }
}

}  // namespace slam_benchmark
