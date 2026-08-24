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
    // Cumulative user + kernel CPU time consumed by all threads in this process.
    // Unlike wall time, concurrent work on multiple cores is accumulated.
    [[nodiscard]] static double process_cpu_time_seconds() noexcept;
    [[nodiscard]] CpuUsage sample();

private:
    std::chrono::steady_clock::time_point previous_wall_;
    double previous_process_seconds_{};
    unsigned int logical_cpu_count_{1};
};

}  // namespace slam_benchmark
