#pragma once

#include "slam_benchmark/algorithm.hpp"

namespace slam_benchmark {

// Shared executable contract used by every patched algorithm:
// --dataset-manifest PATH --bag NAME --config PATH --output PATH
int run_benchmark_main(int argc, char** argv, SlamAlgorithm& algorithm);

}  // namespace slam_benchmark

