# 算法参数约定

默认配置使用语义与单位明确的公共字段，避免不同上游项目的同名参数实际作用不同：

| 参数 | 统一语义 |
|---|---|
| `filter_size_scan_m` | 当前雷达帧进入匹配前的体素降采样边长 |
| `filter_size_map_m` | 新点插入地图前的体素降采样边长，仅用于具有独立地图降采样的算法 |
| `map_voxel_size_m` | 哈希或自适应体素地图的空间索引分辨率 |
| `max_iterations` | 算法自身一次状态或配准优化的最大迭代次数 |
| `estimate_extrinsics` | 是否在线估计 LiDAR/IMU 外参 |
| `*_noise` | 算法内部使用的对应测量或随机游走噪声参数 |

FAST-LIO、Point-LIO、Faster-LIO、Super-LIO、VoxelMap 和 Small Point LIO 的扫描
降采样默认统一为 `0.5 m`。具有独立地图插入降采样的算法默认也统一为 `0.5 m`。

VoxelMap 原项目的 `mapping/voxel_size` 是自适应地图顶层体素尺寸，并不是扫描滤波尺寸；
现在明确映射为 `map_voxel_size_m`。原项目的 `mapping/down_sample_size` 映射为
`filter_size_scan_m`。顶层地图体素仍采用原算法默认的 `1.0 m`，因为其下方还有
`max_layer` 层八叉树，不能与单层哈希地图的分辨率直接等同。

KISS-ICP 的 `voxel_size_m` 同时决定地图体素和其内部两级扫描采样比例，无法与上述两个
独立参数一一对应，因此保留算法专用名称。`max_iterations` 在 KISS-ICP 中是 ICP 上限，
而在 LIO 中通常是滤波器更新上限；比较耗时时应结合实际迭代次数和算法结构解释。

所有真正影响适配器的参数都显式写入 `configs/default.yaml`，不再依靠隐藏的 C++ 默认值。
