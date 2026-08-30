# Manifest 字段

算法 manifest 必填：`name`、`description`、`authors`、`license`、`repository`、
`dependencies`、`paper`、`sensors`、`timing_stages`。`repository` 包含 `name/url/ref`；
依赖项包含 `name/url/ref`，可用 `directory` 指定其在算法 `source` 下的目录，并用
`patches` 列出相对算法目录的兼容补丁，下载脚本会幂等地应用这些补丁；
传感器只能是 `lidar/imu/camera/gnss/wheel_speed`。
算法 manifest 可选的顶层 `source_excludes` 是上游仓库相对路径列表，可指向顶层或嵌套
目录以及单个文件；准备 source 工作树及生成/检查 patch 时会一致裁剪这些路径。移植时完全
删除的文件应放入此列表，避免 Git 删除补丁重复保存完整旧文件内容。
数据集 manifest 必填：`name`、`download_url`、`bags`。bag 包含 `name/path/sensors`；
sensor 包含 `id/name/type/enabled/topic/message_type/calibration`，并按实际数据填写 `units`。
其中 `topic/message_type` 仅供 `rosbag_io` 定位并解码输入，core 在算法初始化前会将其剥离；
算法只接收 benchmark 自有的 `SensorDefinition` 和结构化 `SensorSample`。
`sensors` 应完整列出 bag 中可供算法使用的传感器；同一类型有多个传感器时可设置整数
`priority`（数值越大越优先，缺省为 0）。算法初始化时，公共兼容性检查会结合算法需要的
传感器类型及点云能力，自动选择每种类型中优先级最高的兼容传感器，runner 只回放这些
被选中的流。因此双 LiDAR、多 IMU 数据集不需要前端人工选择，也不会把同类型多路消息
混送给只支持一路输入的算法。相同优先级保持 manifest 中的声明顺序。`enabled: false`
会在检查、自动选择和回放之前禁用该传感器；它不替代 `priority`，所有参与选优的传感器
都应设置为 `enabled: true`。

多传感器 bag 可增加 `sensor_inventory` 作为网页展示清单；其字段格式与 `sensors` 相同，
但不参与初始化选择。通常它应与完整的 `sensors` 清单一致，网页端会隐藏其中
`enabled: false` 的传感器。
bag 可选 `max_output_position_m`（正数，缺省 2000）限制算法输出位姿离原点的最大距离：
超过该值或输出非有限值的运行会被判为失败，失败原因会写进 summary 并显示在网页上。
大尺度数据集可按 bag 调高该值。
带轨迹真值的 bag 可增加 `ground_truth`，支持两种格式：

```yaml
ground_truth:
  path: /data/sequence.txt
  format: tum              # 缺省按 TUM 处理
  max_time_difference_ms: 100
```

TUM 每行依次为秒级时间戳、`x y z qx qy qz qw`。网页会把真值叠加到轨迹图：
真值起点先平移到原点，再按初始朝向与第一条算法轨迹对齐，解决真值世界系与算法
系起点/朝向不一致导致的无法重叠；精度仍按刚体 SE(3) 对齐（不校正尺度）后的
ATE RMSE 计算。时间戳不足以匹配或算法没有生成有效轨迹时，精度结果显示“失败”。

只发布终点位姿的序列可改用 `format: end_pose`：文件内容为 3×3 旋转矩阵（行优先）
加 3×1 平移（相对起点的真实终点），可附带 `bag_time: NNs` 时长行。网页会在轨迹图上
用菱形标出“真实终点”，精度对比改为计算算法末位姿到该真实终点的欧氏距离。

```yaml
ground_truth:
  path: /rosbag/M3DGR/LiDAR_Degeneration/Corridor01.txt
  format: end_pose
```
点云传感器可用 `point_time_field` 和 `intensity_field` 指定原始消息中的逐点时间及强度
字段；默认分别为 `time` 和 `intensity`。runner 会从 PointCloud2 的首条实际消息验证这两个
字段是否存在，而不是只相信 manifest。存在的强度写入每个 `PointXYZIR::intensity`；Livox
CustomMsg 的 `reflectivity` 会写入同一字段。缺失字段不会让 reader 崩溃，依赖它的算法会
在初始化兼容性检查中返回具体原因并跳过。

传感器存在固定时钟偏移时，可设置秒单位的 `timestamp_offset_s`。reader 会在数据进入
算法前统一修正消息时间戳；正值表示将该传感器时间向后移动。例如相机时间戳需要增加
100 ms 时填写 `timestamp_offset_s: 0.1`。时间偏移属于数据集标定，不应写进算法配置。

校验同时确保默认配置中的 `algorithm` 与目录 ID 一致，并检查通用体素参数为正数。
可运行 `python scripts/validate_manifests.py` 做结构校验。完整示例位于
`datasets/example/manifest.yaml`。
