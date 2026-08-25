set(_source "${CMAKE_CURRENT_SOURCE_DIR}/source/LIGO.")
set(_gtsam_source "${CMAKE_CURRENT_SOURCE_DIR}/source/gtsam")
set(_gnss_comm_source "${CMAKE_CURRENT_SOURCE_DIR}/source/gnss_comm")
set(_fast_lio_source "${CMAKE_SOURCE_DIR}/algorithm/fast_lio/source/FAST_LIO")

foreach(_required IN ITEMS
        "${_source}/standalone/main.cpp"
        "${_gtsam_source}/CMakeLists.txt"
        "${_gnss_comm_source}/include/gnss_comm/gnss_utility.hpp"
        "${_fast_lio_source}/standalone/fast_lio_engine.cpp")
    if(NOT EXISTS "${_required}")
        message(FATAL_ERROR
            "LIGO standalone dependency is missing: ${_required}. "
            "Download LIGO, GTSAM, gnss_comm and FAST-LIO sources first.")
    endif()
endforeach()

if(NOT TARGET gtsam)
    set(GTSAM_BUILD_TESTS OFF CACHE BOOL "" FORCE)
    set(GTSAM_BUILD_EXAMPLES_ALWAYS OFF CACHE BOOL "" FORCE)
    set(GTSAM_BUILD_TIMING_ALWAYS OFF CACHE BOOL "" FORCE)
    set(GTSAM_BUILD_UNSTABLE OFF CACHE BOOL "" FORCE)
    set(GTSAM_BUILD_PYTHON OFF CACHE BOOL "" FORCE)
    set(GTSAM_WITH_TBB OFF CACHE BOOL "" FORCE)
    set(GTSAM_USE_SYSTEM_EIGEN ON CACHE BOOL "" FORCE)
    set(GTSAM_BUILD_WITH_MARCH_NATIVE OFF CACHE BOOL "" FORCE)
    add_subdirectory("${_gtsam_source}" "${CMAKE_BINARY_DIR}/algorithm/ligo-gtsam")
endif()

if(NOT TARGET fast_lio_algorithm)
    add_subdirectory("${_fast_lio_source}"
                     "${CMAKE_BINARY_DIR}/algorithm/ligo-fast-lio")
endif()

add_subdirectory("${_source}" ligo)
