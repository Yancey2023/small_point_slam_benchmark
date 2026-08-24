#pragma once

#include "slam_benchmark/types.hpp"

#include <array>

namespace slam_benchmark {

using TransformMatrix = std::array<double, 16>;

// Returns target_from_source from two sensor-to-body calibrations:
// target_from_source = inverse(body_from_target) * body_from_source.
[[nodiscard]] inline TransformMatrix target_from_source(
    const SensorCalibration& target,
    const SensorCalibration& source) noexcept {
    const auto& body_from_target = target.body_from_sensor;
    const auto& body_from_source = source.body_from_sensor;
    TransformMatrix result{
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
    };

    // R_target_body is the transpose of R_body_target.
    for (int row = 0; row < 3; ++row) {
        for (int column = 0; column < 3; ++column) {
            double value = 0.0;
            for (int index = 0; index < 3; ++index) {
                value += body_from_target[index * 4 + row] *
                         body_from_source[index * 4 + column];
            }
            result[row * 4 + column] = value;
        }
        double translation = 0.0;
        for (int index = 0; index < 3; ++index) {
            translation += body_from_target[index * 4 + row] *
                           (body_from_source[index * 4 + 3] -
                            body_from_target[index * 4 + 3]);
        }
        result[row * 4 + 3] = translation;
    }
    return result;
}

}  // namespace slam_benchmark
