cmake_minimum_required(VERSION 3.24)
project(small_point_slam_benchmark VERSION 0.1.0 LANGUAGES C CXX)

option(SLAM_BENCHMARK_BUILD_TESTS "Build benchmark tests" ON)
option(SLAM_BENCHMARK_BUILD_ALGORITHMS "Build downloaded algorithm adapters" OFF)
set(SLAM_BENCHMARK_PARALLEL_THREADS 4 CACHE STRING
    "Maximum compute threads used by each parallel algorithm")
if(NOT SLAM_BENCHMARK_PARALLEL_THREADS MATCHES "^[1-9][0-9]*$")
    message(FATAL_ERROR "SLAM_BENCHMARK_PARALLEL_THREADS must be a positive integer")
endif()
file(GLOB _algorithm_manifests CONFIGURE_DEPENDS
    RELATIVE "${CMAKE_CURRENT_SOURCE_DIR}/algorithm"
    "${CMAKE_CURRENT_SOURCE_DIR}/algorithm/*/manifest.yaml")
set(_discovered_algorithms)
foreach(_manifest IN LISTS _algorithm_manifests)
    get_filename_component(_algorithm "${_manifest}" DIRECTORY)
    list(APPEND _discovered_algorithms "${_algorithm}")
endforeach()
list(SORT _discovered_algorithms)
set(SLAM_BENCHMARK_ALGORITHMS "${_discovered_algorithms}"
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
    include(FetchContent)

    # Keep downloaded source trees outside the build tree, while leaving all
    # FetchContent sub-builds and binary directories under CMAKE_BINARY_DIR.
    set(SLAM_BENCHMARK_THIRD_PARTY_DOWNLOAD_DIR
        "${CMAKE_CURRENT_SOURCE_DIR}/3rdparty_downloads")
    set(ROSBAG_IO_BUILD_TESTS OFF CACHE BOOL "" FORCE)
    set(ROSBAG_IO_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
    set(ROSBAG_IO_THIRD_PARTY_DOWNLOAD_DIR
        "${SLAM_BENCHMARK_THIRD_PARTY_DOWNLOAD_DIR}"
        CACHE PATH "Directory used for downloaded rosbag_io dependencies" FORCE)
    FetchContent_Declare(
        rosbag_io
        GIT_REPOSITORY https://github.com/Yancey2023/rosbag_io.git
        GIT_TAG 00184b5d16883547a3a8bb30bd4c7f73221fc2ff
        SOURCE_DIR "${SLAM_BENCHMARK_THIRD_PARTY_DOWNLOAD_DIR}/rosbag_io"
    )
    FetchContent_MakeAvailable(rosbag_io)
endif()

add_subdirectory(core)

if(SLAM_BENCHMARK_BUILD_ALGORITHMS)
    foreach(algorithm IN LISTS SLAM_BENCHMARK_ALGORITHMS)
        if(NOT algorithm IN_LIST _discovered_algorithms)
            message(FATAL_ERROR "Unknown algorithm in SLAM_BENCHMARK_ALGORITHMS: ${algorithm}")
        endif()
        add_subdirectory("algorithm/${algorithm}" "algorithm/${algorithm}")
    endforeach()
endif()

if(SLAM_BENCHMARK_BUILD_TESTS)
    enable_testing()
    add_subdirectory(core/tests)
endif()
