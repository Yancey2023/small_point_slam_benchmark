#pragma once

#include "slam_benchmark/dataset_manifest.hpp"

#include <functional>
#include <vector>

namespace slam_benchmark {

class DatasetReader {
public:
    using SampleCallback = std::function<void(SensorSample&&)>;
    virtual ~DatasetReader() = default;
    // Inspect concrete bag contents before algorithm initialization. Readers
    // that cannot inspect retain the manifest declarations.
    [[nodiscard]] virtual std::vector<SensorDefinition> inspect(
        const BagDefinition& bag) { return bag.sensors; }
    virtual void read(const BagDefinition& bag, const SampleCallback& callback) = 0;
};

#if defined(SLAM_BENCHMARK_HAS_ROSBAG_IO)
class RosbagDatasetReader final : public DatasetReader {
public:
    [[nodiscard]] std::vector<SensorDefinition> inspect(
        const BagDefinition& bag) override;
    void read(const BagDefinition& bag, const SampleCallback& callback) override;
};
#endif

}  // namespace slam_benchmark
