#pragma once

#include <chrono>

namespace slam_benchmark {

struct CpuUsage {
    // Percentage of one logical CPU. It may exceed 100 for a multi-threaded process.
    double core_percent{};
    // Process CPU use normalized to [0, 100] across all logical CPUs.
    double normalized_percent{};
    // Current resident working set in MiB.
    double resident_memory_mb{};
};

class ProcessMonitor {
public:
    ProcessMonitor();
    [[nodiscard]] CpuUsage sample();

private:
    std::chrono::steady_clock::time_point previous_wall_;
    double previous_process_seconds_{};
    unsigned int logical_cpu_count_{1};
};

}  // namespace slam_benchmark
