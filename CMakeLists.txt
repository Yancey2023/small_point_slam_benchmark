cmake_minimum_required(VERSION 3.24)
project(small_point_slam_benchmark VERSION 0.1.0 LANGUAGES C CXX)

option(SLAM_BENCHMARK_BUILD_TESTS "Build benchmark tests" ON)
option(SLAM_BENCHMARK_BUILD_ALGORITHMS "Build downloaded algorithm adapters" OFF)
set(SLAM_BENCHMARK_ALGORITHMS "fast_lio;point_lio;voxel_map;super_lio"
    CACHE STRING "Semicolon-separated algorithms to build when adapters are enabled")
option(SLAM_BENCHMARK_ENABLE_ROSBAG_IO "Build the rosbag-backed dataset reader" ON)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

find_package(yaml-cpp CONFIG REQUIRED)
find_package(spdlog CONFIG REQUIRED)
find_package(Threads REQUIRED)

if(SLAM_BENCHMARK_ENABLE_ROSBAG_IO)
    if(NOT EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/3rdparty/rosbag_io/CMakeLists.txt")
        message(FATAL_ERROR
            "3rdparty/rosbag_io is missing. Copy it there or initialize the future submodule.")
    endif()
    set(ROSBAG_IO_BUILD_TESTS OFF CACHE BOOL "" FORCE)
    set(ROSBAG_IO_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
    add_subdirectory(3rdparty/rosbag_io EXCLUDE_FROM_ALL)
endif()

add_subdirectory(core)

if(SLAM_BENCHMARK_BUILD_ALGORITHMS)
    foreach(algorithm IN LISTS SLAM_BENCHMARK_ALGORITHMS)
        if(NOT algorithm MATCHES "^(fast_lio|point_lio|voxel_map|super_lio)$")
            message(FATAL_ERROR "Unknown algorithm in SLAM_BENCHMARK_ALGORITHMS: ${algorithm}")
        endif()
        add_subdirectory("algorithm/${algorithm}" "algorithm/${algorithm}")
    endforeach()
endif()

if(SLAM_BENCHMARK_BUILD_TESTS)
    enable_testing()
    add_subdirectory(core/tests)
endif()
