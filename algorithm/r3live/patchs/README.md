# R3LIVE benchmark patch

`0001-standalone-core-adapter.patch` removes ROS transport and visualization,
then exposes the pinned estimator through the benchmark's sensor and result
interfaces. Dataset topics, timestamps, units and calibration remain owned by
the dataset manifest.
