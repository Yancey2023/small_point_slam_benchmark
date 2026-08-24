# Manifest 字段

算法 manifest 必填：`name`、`description`、`authors`、`license`、`repository`、
`dependencies`、`paper`、`sensors`、`timing_stages`。`repository` 包含 `name/url/ref`；
传感器只能是 `lidar/imu/camera/gnss/wheel_speed`。
数据集 manifest 必填：`name`、`download_url`、`bags`。bag 包含 `name/path/sensors`；
sensor 包含 `id/name/type/topic/message_type/calibration`，并按实际数据填写 `units`。
点云传感器可用 `point_time_field` 和 `intensity_field` 指定原始消息中的逐点时间及强度
字段；默认分别为 `time` 和 `intensity`。runner 会从 PointCloud2 的首条实际消息验证这两个
字段是否存在，而不是只相信 manifest。存在的强度写入每个 `PointXYZIR::intensity`；Livox
CustomMsg 的 `reflectivity` 会写入同一字段。缺失字段不会让 reader 崩溃，依赖它的算法会
在初始化兼容性检查中返回具体原因并跳过。

校验同时确保默认配置中的 `algorithm` 与目录 ID 一致，并检查通用体素参数为正数。
可运行 `python scripts/validate_manifests.py` 做结构校验。完整示例位于
`datasets/example/manifest.yaml`。
