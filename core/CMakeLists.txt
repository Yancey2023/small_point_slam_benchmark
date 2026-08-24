set(SLAM_BENCHMARK_CORE_SOURCES
    src/algorithm.cpp
    src/application.cpp
    src/benchmark_runner.cpp
    src/csv_writer.cpp
    src/dataset_manifest.cpp
    src/process_monitor.cpp
)

if(SLAM_BENCHMARK_ENABLE_ROSBAG_IO)
    list(APPEND SLAM_BENCHMARK_CORE_SOURCES src/rosbag_dataset_reader.cpp)
endif()

add_library(slam_benchmark_core STATIC ${SLAM_BENCHMARK_CORE_SOURCES})
add_library(slam_benchmark::core ALIAS slam_benchmark_core)

target_include_directories(slam_benchmark_core PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>
)
target_link_libraries(slam_benchmark_core
    PUBLIC yaml-cpp::yaml-cpp spdlog::spdlog Threads::Threads
)
if(WIN32)
    target_link_libraries(slam_benchmark_core PRIVATE Psapi)
endif()
if(SLAM_BENCHMARK_ENABLE_ROSBAG_IO)
    target_link_libraries(slam_benchmark_core PRIVATE rosbag_io)
    target_compile_definitions(slam_benchmark_core PUBLIC SLAM_BENCHMARK_HAS_ROSBAG_IO=1)
endif()

if(MSVC)
    target_compile_options(slam_benchmark_core PRIVATE /W4 /permissive- /utf-8)
else()
    target_compile_options(slam_benchmark_core PRIVATE -Wall -Wextra -Wpedantic)
endif()
