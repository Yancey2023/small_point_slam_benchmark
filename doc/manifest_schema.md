# Manifest 字段

算法 manifest 必填：`name`、`description`、`authors`、`license`、`repository`、
`dependencies`、`paper`、`sensors`、`timing_stages`。`repository` 包含 `name/url/ref`；
传感器只能是 `lidar/imu/camera/gnss/wheel_speed`。
数据集 manifest 必填：`name`、`download_url`、`bags`。bag 包含 `name/path/sensors`；
sensor 包含 `id/name/type/topic/message_type/calibration`，并按实际数据填写 `units`。

校验同时确保默认配置中的 `algorithm` 与目录 ID 一致，并检查通用体素参数为正数。
可运行 `python scripts/validate_manifests.py` 做结构校验。完整示例位于
`datasets/example/manifest.yaml`。
