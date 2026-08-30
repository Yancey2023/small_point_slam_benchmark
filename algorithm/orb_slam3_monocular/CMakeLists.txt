set(_source "${CMAKE_CURRENT_SOURCE_DIR}/source/ORB_SLAM3")
if(NOT EXISTS "${_source}/standalone/main_monocular.cpp")
    message(FATAL_ERROR
        "Run scripts/download_algorithms.py orb_slam3_monocular and "
        "scripts/patch_algorithms.py apply orb_slam3_monocular")
endif()
if(NOT TARGET orb_slam3_monocular_benchmark)
    add_subdirectory("${_source}" ORB_SLAM3)
endif()
