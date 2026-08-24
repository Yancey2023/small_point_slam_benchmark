#include "slam_benchmark/process_monitor.hpp"

#include <algorithm>
#include <cstdint>
#include <fstream>
#include <sstream>
#include <thread>

#if defined(_WIN32)
#define NOMINMAX
#include <windows.h>
#include <psapi.h>
#else
#include <sys/resource.h>
#include <unistd.h>
#endif

namespace slam_benchmark {
namespace {

double current_process_cpu_seconds() noexcept {
#if defined(_WIN32)
    FILETIME creation{}, exit{}, kernel{}, user{};
    if (!GetProcessTimes(GetCurrentProcess(), &creation, &exit, &kernel, &user)) return 0.0;
    const auto ticks = [](const FILETIME& value) {
        return (static_cast<std::uint64_t>(value.dwHighDateTime) << 32U) | value.dwLowDateTime;
    };
    return static_cast<double>(ticks(kernel) + ticks(user)) * 1e-7;
#else
    rusage usage{};
    if (getrusage(RUSAGE_SELF, &usage) != 0) return 0.0;
    const auto seconds = [](const timeval& value) {
        return static_cast<double>(value.tv_sec) + static_cast<double>(value.tv_usec) * 1e-6;
    };
    return seconds(usage.ru_utime) + seconds(usage.ru_stime);
#endif
}

double resident_memory_mb() {
#if defined(_WIN32)
    PROCESS_MEMORY_COUNTERS counters{};
    counters.cb = sizeof(counters);
    if (!GetProcessMemoryInfo(GetCurrentProcess(), &counters, sizeof(counters))) return 0.0;
    return static_cast<double>(counters.WorkingSetSize) / (1024.0 * 1024.0);
#elif defined(__linux__)
    std::ifstream stream("/proc/self/statm");
    std::uint64_t total_pages = 0;
    std::uint64_t resident_pages = 0;
    if (!(stream >> total_pages >> resident_pages)) return 0.0;
    (void)total_pages;
    const long page_size = sysconf(_SC_PAGESIZE);
    if (page_size <= 0) return 0.0;
    return static_cast<double>(resident_pages) * static_cast<double>(page_size) /
           (1024.0 * 1024.0);
#else
    rusage usage{};
    if (getrusage(RUSAGE_SELF, &usage) != 0) return 0.0;
    return static_cast<double>(usage.ru_maxrss) / 1024.0;
#endif
}

}  // namespace

ProcessMonitor::ProcessMonitor()
    : previous_wall_(std::chrono::steady_clock::now()),
      previous_process_seconds_(process_cpu_time_seconds()),
      logical_cpu_count_(std::max(1U, std::thread::hardware_concurrency())) {}

double ProcessMonitor::process_cpu_time_seconds() noexcept {
    return current_process_cpu_seconds();
}

CpuUsage ProcessMonitor::sample() {
    const auto now = std::chrono::steady_clock::now();
    const double cpu_now = process_cpu_time_seconds();
    const double wall_seconds = std::chrono::duration<double>(now - previous_wall_).count();
    const double cpu_seconds = std::max(0.0, cpu_now - previous_process_seconds_);
    previous_wall_ = now;
    previous_process_seconds_ = cpu_now;
    const double memory_mb = resident_memory_mb();
    if (wall_seconds <= 0.0) return {0.0, 0.0, memory_mb};
    const double core_percent = 100.0 * cpu_seconds / wall_seconds;
    return {core_percent, core_percent / static_cast<double>(logical_cpu_count_), memory_mb};
}

}  // namespace slam_benchmark
