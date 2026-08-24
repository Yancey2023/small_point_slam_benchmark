#include "slam_benchmark/calibration.hpp"

#include <cmath>
#include <stdexcept>

namespace {
void expect_near(double actual, double expected) {
    if (std::abs(actual - expected) > 1e-12)
        throw std::runtime_error("calibration transform mismatch");
}
}  // namespace

int main() {
    slam_benchmark::SensorCalibration imu;
    imu.body_from_sensor = {
        0, -1, 0, 1,
        1,  0, 0, 2,
        0,  0, 1, 3,
        0,  0, 0, 1,
    };
    slam_benchmark::SensorCalibration lidar;
    lidar.body_from_sensor = {
        0, -1, 0, 1,
        1,  0, 0, 4,
        0,  0, 1, 6,
        0,  0, 0, 1,
    };

    const auto imu_from_lidar =
        slam_benchmark::target_from_source(imu, lidar);
    expect_near(imu_from_lidar[0], 1.0);
    expect_near(imu_from_lidar[5], 1.0);
    expect_near(imu_from_lidar[10], 1.0);
    expect_near(imu_from_lidar[3], 2.0);
    expect_near(imu_from_lidar[7], 0.0);
    expect_near(imu_from_lidar[11], 3.0);
}
