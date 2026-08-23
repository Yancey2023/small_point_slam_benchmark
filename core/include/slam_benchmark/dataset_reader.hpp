#pragma once

#include "slam_benchmark/dataset_manifest.hpp"

#include <functional>

namespace slam_benchmark {

class DatasetReader {
public:
    using SampleCallback = std::function<void(SensorSample&&)>;
    virtual ~DatasetReader() = default;
    virtual void read(const BagDefinition& bag, const SampleCallback& callback) = 0;
};

#if defined(SLAM_BENCHMARK_HAS_ROSBAG_IO)
class RosbagDatasetReader final : public DatasetReader {
public:
    void read(const BagDefinition& bag, const SampleCallback& callback) override;
};
#endif

}  // namespace slam_benchmark

