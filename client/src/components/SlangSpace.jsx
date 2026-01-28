import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass";

/////////////////////////////////
// 可调参数
const TEXT_FONT_SIZE = 40;
const TILE_BASE_WIDTH = 5;
const TILE_BASE_HEIGHT = 3;
const TILE_GAP = 1.5;

// cube 时间相关
const START_YEAR = 2019;
const START_MONTH = 1; // 起始月份 (1-12)
const MONTHS_PER_CUBE = 6; // 每个 cube 代表几个月
const END_YEAR = 2025;
const END_MONTH = 12; // 结束月份

// cube 尺寸相关
const INNER_CUBE_SIZE = 60; // 最内层 cube 的大小
const OUTER_CUBE_SIZE = 360; // 最外层 cube 的大小
const CUBE_TWIST = 0.7; // 每层 cube 之间的扭转角度 (弧度)

// 背景假片相关
const BG_TILE_COUNT = 1000; // 背景假片数量
const BG_MIN_DIST = 390; // 假片最近距离
const BG_MAX_DIST = 500; // 假片最远距离
const BG_OPACITY = 0.3; // 假片透明度

// 缩放限制
const ZOOM_MIN = 80; // 最近
const ZOOM_MAX = 400; // 最远

// 高亮颜色相关
const NORMAL_COLOR = 0x999999; // 初始灰色
const HIGHLIGHT_COLOR = 0xffffff; // 直接悬停/被访问过的片：白色
const SLANG_HIGHLIGHT_COLOR = 0xe6e070; // 同 slang 其他片：亮红（配合发光效果）

// 发光效果相关
const BLOOM_STRENGTH = 0.7; // 直接选中的发光强度 (0 = 无发光)
const BLOOM_RADIUS = 0.4; // 发光扩散半径
const BLOOM_THRESHOLD = 0.5; // 触发发光的亮度阈值 (0-1，越低越多物体发光)
const SLANG_GLOW_BRIGHTNESS = 1.1; // 同 slang 间接高亮的发光亮度倍数 (1 = 无额外发光，越大越亮越发光)

// 预计算发光颜色
const slangGlowColor = new THREE.Color(SLANG_HIGHLIGHT_COLOR).multiplyScalar(SLANG_GLOW_BRIGHTNESS);

// 簇尺寸相关
const CLUSTER_SIZE_MIN = 0.8; // 随机尺寸下限
const CLUSTER_SIZE_MAX = 2.0; // 随机尺寸上限
const LAYER_SIZE_FACTOR = 0.1; // 层级尺寸因子：最内层乘(1-此值)，最外层乘(1+此值)，中间层不变

// Cube 边框相关
const CUBE_EDGE_OPACITY = 0.83; // cube 边框透明度 (0 = 隐形, 1 = 完全可见)
const CUBE_EDGE_COLOR = 0x989898; // 边框颜色
const CUBE_EDGE_DASH_SIZE = 0.5; // 虚线段长度
const CUBE_EDGE_GAP_SIZE = 2; // 虚线间隔长度
const CUBE_EDGE_SKIP_INNER = 2; // 最内层几个 cube 不显示边框

// Cube 时间标签相关
const CUBE_LABEL_OPACITY = 1; // 标签透明度 (0 = 隐形)
const CUBE_LABEL_SIZE = 8; // 标签尺寸
/////////////////////////////////

// 按时间分簇
function splitIntoClustersByTime(comments, maxClusters = 10) {
  if (!comments || comments.length === 0) return [];

  const sorted = [...comments].sort((a, b) => {
    const ta = a.time ? new Date(a.time).getTime() : Infinity;
    const tb = b.time ? new Date(b.time).getTime() : Infinity;
    return ta - tb;
  });

  const total = sorted.length;
  const clusterCount = Math.min(maxClusters, total);
  const baseSize = Math.floor(total / clusterCount);
  const remainder = total % clusterCount;

  const clusters = [];
  let idx = 0;
  for (let i = 0; i < clusterCount; i++) {
    const size = baseSize + (i < remainder ? 1 : 0);
    if (size > 0) {
      clusters.push(sorted.slice(idx, idx + size));
      idx += size;
    }
  }
  return clusters;
}

// 计算从起始点到某个日期经过了多少个周期
function getDatePeriodIndex(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-12

  // 从起始点开始计算经过的月数
  const startMonths = START_YEAR * 12 + START_MONTH;
  const currentMonths = year * 12 + month;
  const monthsDiff = currentMonths - startMonths;

  return Math.floor(monthsDiff / MONTHS_PER_CUBE);
}

// 计算总共有多少个周期
function getTotalPeriods() {
  const startMonths = START_YEAR * 12 + START_MONTH;
  const endMonths = END_YEAR * 12 + END_MONTH;
  return Math.ceil((endMonths - startMonths) / MONTHS_PER_CUBE);
}

// 获取周期的时间范围标签（只显示起始年月）
function getPeriodLabel(periodIndex) {
  const startMonths = START_YEAR * 12 + START_MONTH;
  const periodStartMonths = startMonths + periodIndex * MONTHS_PER_CUBE;

  const startYear = Math.floor((periodStartMonths - 1) / 12);
  const startMonth = ((periodStartMonths - 1) % 12) + 1;

  return `${startYear}.${startMonth}`;
}

// 获取簇的平均时间对应的周期索引
function getClusterPeriodIndex(cluster) {
  const validTimes = cluster.filter((c) => c.time).map((c) => new Date(c.time).getTime());
  if (validTimes.length === 0) {
    // 没有时间的放到最新的周期
    return getTotalPeriods() - 1;
  }
  const avgTime = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
  return getDatePeriodIndex(new Date(avgTime));
}

// 根据周期索引获取 cube 大小
function getCubeSize(periodIndex) {
  const total = getTotalPeriods();
  const clampedIndex = Math.max(0, Math.min(total - 1, periodIndex));
  const ratio = total > 1 ? clampedIndex / (total - 1) : 0;
  return INNER_CUBE_SIZE + ratio * (OUTER_CUBE_SIZE - INNER_CUBE_SIZE);
}

// 根据周期索引获取 cube 的累积旋转角度
function getCubeRotation(periodIndex) {
  return periodIndex * CUBE_TWIST;
}

// Slot 位置定义：4个角落 + 1个中心
// 网格配置：4x4 = 16 个 slot
const GRID_SIZE = 4;
const TOTAL_SLOTS = GRID_SIZE * GRID_SIZE; // 16
const SLOT_JITTER = 0.08; // 随机抖动范围（保持参差感）

// 边缘格子（优先使用）和中间格子
const EDGE_SLOTS = [0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15]; // 12个
const MIDDLE_SLOTS = [5, 6, 9, 10]; // 4个

// 根据 slot 索引计算基础 uv 位置（-0.75 到 0.75 范围内均匀分布）
function getSlotBasePosition(slotIndex) {
  const row = Math.floor(slotIndex / GRID_SIZE);
  const col = slotIndex % GRID_SIZE;
  // 从 -0.7 到 0.7，均匀分布
  const u = -0.7 + (col / (GRID_SIZE - 1)) * 1.4;
  const v = -0.7 + (row / (GRID_SIZE - 1)) * 1.4;
  return { u, v };
}

// 在 cube 的某个面上指定 slot 放置
function getPositionOnCubeFace(cubeSize, faceIndex, slotIndex) {
  const half = cubeSize / 2;

  // 获取 slot 的基础 uv 位置
  const basePos = getSlotBasePosition(slotIndex);
  // 添加随机抖动
  const u = (basePos.u + (Math.random() - 0.5) * SLOT_JITTER * 2) * half;
  const v = (basePos.v + (Math.random() - 0.5) * SLOT_JITTER * 2) * half;

  // 随机选择四个朝向之一 (0°, 90°, 180°, 270°)
  const rotationOptions = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
  const extraRotation = rotationOptions[Math.floor(Math.random() * 4)];

  let pos, lookDir;

  switch (faceIndex) {
    case 0: // +X face
      pos = new THREE.Vector3(half, v, u);
      lookDir = new THREE.Vector3(1, 0, 0);
      break;
    case 1: // -X face
      pos = new THREE.Vector3(-half, v, u);
      lookDir = new THREE.Vector3(-1, 0, 0);
      break;
    case 2: // +Y face
      pos = new THREE.Vector3(u, half, v);
      lookDir = new THREE.Vector3(0, 1, 0);
      break;
    case 3: // -Y face
      pos = new THREE.Vector3(u, -half, v);
      lookDir = new THREE.Vector3(0, -1, 0);
      break;
    case 4: // +Z face
      pos = new THREE.Vector3(u, v, half);
      lookDir = new THREE.Vector3(0, 0, 1);
      break;
    case 5: // -Z face
    default:
      pos = new THREE.Vector3(u, v, -half);
      lookDir = new THREE.Vector3(0, 0, -1);
      break;
  }

  return { pos, lookDir, extraRotation };
}

// 排列簇内的 comment
function arrangeCluster(comments) {
  const n = comments.length;
  const cols = Math.ceil(Math.sqrt(n * 2));
  const rows = Math.ceil(n / cols);

  const arranged = [];
  let idx = 0;
  for (let r = 0; r < rows && idx < n; r++) {
    for (let c = 0; c < cols && idx < n; c++) {
      arranged.push({ ...comments[idx], gridX: c, gridY: r });
      idx++;
    }
  }
  return { arranged, cols, rows };
}

// 创建文字贴图 - 只显示前 3 个词
function createTextTexture(comment, scale = 1) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const w = Math.floor(256 * scale);
  const h = Math.floor(128 * scale);
  canvas.width = w;
  canvas.height = h;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#000000";
  const fontSize = Math.floor(TEXT_FONT_SIZE * scale);
  ctx.font = `bold ${fontSize}px monospace`;

  const text = comment.text || "";
  const words = text.split(" ").slice(0, 3);
  const preview = words.join(" ") + (text.split(" ").length > 3 ? "..." : "");

  let line = "";
  let y = fontSize + 5;
  const maxWidth = w - 20;
  const lineHeight = fontSize + 4;

  for (const word of preview.split(" ")) {
    const test = line + word + " ";
    if (ctx.measureText(test).width > maxWidth) {
      ctx.fillText(line, 10, y);
      line = word + " ";
      y += lineHeight;
      if (y > h - 10) break;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, 10, y);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// 创建背景假片（纯视觉，不可交互）
function createBackgroundTiles(scene) {
  const geo = new THREE.PlaneGeometry(TILE_BASE_WIDTH * 1.5, TILE_BASE_HEIGHT * 1.5);

  // 灰色半透明材质
  const mat = new THREE.MeshBasicMaterial({
    color: 0x888888,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: BG_OPACITY,
  });

  for (let i = 0; i < BG_TILE_COUNT; i++) {
    const mesh = new THREE.Mesh(geo, mat);

    // 随机球面分布
    const dist = BG_MIN_DIST + Math.random() * (BG_MAX_DIST - BG_MIN_DIST);
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * Math.PI;

    mesh.position.set(
      dist * Math.cos(phi) * Math.cos(theta),
      dist * Math.sin(phi),
      dist * Math.cos(phi) * Math.sin(theta)
    );

    // 随机朝向
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

    // 标记为背景，不加入交互列表
    mesh.userData.isBackground = true;

    scene.add(mesh);
  }
}

// 创建 cube 时间标签（贴在顶面后边）
function createCubeLabel(periodIndex, cubeSize) {
  if (CUBE_LABEL_OPACITY <= 0) return null;

  const label = getPeriodLabel(periodIndex);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 1024;
  canvas.height = 128;

  // 不填充背景，保持透明
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffffff";
  ctx.font = "64px 'Consolas', 'Monaco', monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 20, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: CUBE_LABEL_OPACITY,
    side: THREE.DoubleSide,
    alphaTest: 0.1, // 丢弃透明像素，去掉"底"
  });

  // 平面贴在顶面后边
  const aspect = canvas.width / canvas.height;
  const labelHeight = CUBE_LABEL_SIZE;
  const labelWidth = labelHeight * aspect;
  const geo = new THREE.PlaneGeometry(labelWidth, labelHeight);
  const mesh = new THREE.Mesh(geo, material);

  const half = cubeSize / 2;
  // 位置：顶面后边的最左端
  mesh.position.set(-half + labelWidth / 2, half + 0.1, -half + labelHeight / 2);
  // 旋转：平躺在顶面（绕X轴-90度），文字沿X轴方向
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.y = 0;
  mesh.rotation.z = 0;

  return mesh;
}

export default function SlangSpace({
  slangs,
  tempSlang,
  highlightSlang,
  onHoverComment,
  onClickComment,
}) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const meshesRef = useRef(new Map());
  const allMeshesRef = useRef([]);
  const tempMeshesRef = useRef([]); // 临时搜索结果的 meshes
  const tempGroupsRef = useRef([]); // 临时搜索结果的 groups
  const cubeGroupsRef = useRef(new Map()); // periodIndex -> Group
  const occupiedSlotsRef = useRef(new Map()); // "periodIndex-faceIndex-slotIndex" -> true

  // 查找可用的 slot（4x4 网格，优先边缘格子）
  const findAvailableSlot = (periodIndex) => {
    // 随机打乱顺序，增加随机性
    const faces = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
    const edgeSlots = [...EDGE_SLOTS].sort(() => Math.random() - 0.5);
    const middleSlots = [...MIDDLE_SLOTS].sort(() => Math.random() - 0.5);

    // 先尝试边缘格子
    for (const faceIndex of faces) {
      for (const slotIndex of edgeSlots) {
        const key = `${periodIndex}-${faceIndex}-${slotIndex}`;
        if (!occupiedSlotsRef.current.has(key)) {
          occupiedSlotsRef.current.set(key, true);
          return { faceIndex, slotIndex };
        }
      }
    }

    // 边缘满了，尝试中间格子
    for (const faceIndex of faces) {
      for (const slotIndex of middleSlots) {
        const key = `${periodIndex}-${faceIndex}-${slotIndex}`;
        if (!occupiedSlotsRef.current.has(key)) {
          occupiedSlotsRef.current.set(key, true);
          return { faceIndex, slotIndex };
        }
      }
    }

    // 全满了，随机放置（允许重叠）
    const faceIndex = Math.floor(Math.random() * 6);
    const slotIndex = EDGE_SLOTS[Math.floor(Math.random() * EDGE_SLOTS.length)];
    return { faceIndex, slotIndex };
  };

  // 释放 slot（用于清理临时 meshes）
  const releaseSlot = (periodIndex, faceIndex, slotIndex) => {
    const key = `${periodIndex}-${faceIndex}-${slotIndex}`;
    occupiedSlotsRef.current.delete(key);
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    const w = containerRef.current.clientWidth;
    const h = containerRef.current.clientHeight;

    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 2000);
    camera.position.set(0, 0, 400);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ReinhardToneMapping;
    containerRef.current.appendChild(renderer.domElement);

    // 设置发光后处理
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      BLOOM_STRENGTH,
      BLOOM_RADIUS,
      BLOOM_THRESHOLD
    );
    composer.addPass(bloomPass);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = ZOOM_MIN;
    controls.maxDistance = ZOOM_MAX;

    // 创建背景假片
    createBackgroundTiles(scene);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let hoveredSlang = null;
    let directHoveredMesh = null;

    const onMouseMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(allMeshesRef.current);

      if (intersects.length > 0) {
        const mesh = intersects[0].object;
        const slangTerm = mesh.userData.slangTerm;

        // 切换直接悬停的片
        if (mesh !== directHoveredMesh) {
          // 之前直接悬停的片降为 slang 高亮色（带发光）
          if (
            directHoveredMesh &&
            directHoveredMesh.material &&
            directHoveredMesh.userData.slangTerm === slangTerm
          ) {
            directHoveredMesh.material.color.copy(slangGlowColor);
          }

          directHoveredMesh = mesh;
          mesh.userData.visited = true;
          mesh.material.color.setHex(HIGHLIGHT_COLOR);

          onHoverComment(mesh.userData.comment, slangTerm);
        }

        if (slangTerm !== hoveredSlang) {
          // 取消之前高亮的 slang
          if (hoveredSlang) {
            allMeshesRef.current.forEach((m) => {
              if (m.userData.slangTerm === hoveredSlang && m.material) {
                // 被直接悬停过的保持白色，否则恢复灰色
                m.material.color.setHex(m.userData.visited ? HIGHLIGHT_COLOR : NORMAL_COLOR);
              }
            });
          }

          // 高亮新的 slang 的所有片
          hoveredSlang = slangTerm;
          allMeshesRef.current.forEach((m) => {
            if (m.userData.slangTerm === slangTerm && m.material) {
              // 直接悬停的片白色，其他同 slang 的红色（带发光）
              if (m === mesh) {
                m.material.color.setHex(HIGHLIGHT_COLOR);
              } else {
                m.material.color.copy(slangGlowColor);
              }
            }
          });
        }
      } else {
        // 鼠标离开所有片
        if (hoveredSlang) {
          allMeshesRef.current.forEach((m) => {
            if (m.userData.slangTerm === hoveredSlang && m.material) {
              // 被直接悬停过的保持白色，否则恢复灰色
              m.material.color.setHex(m.userData.visited ? HIGHLIGHT_COLOR : NORMAL_COLOR);
            }
          });
          hoveredSlang = null;
        }
        directHoveredMesh = null;
        onHoverComment(null, null);
      }
    };

    const onClick = () => {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(allMeshesRef.current);
      if (intersects.length > 0) {
        const mesh = intersects[0].object;
        if (mesh.userData.comment) {
          onClickComment(mesh.userData.comment, mesh.userData.slangTerm);
        }
      }
    };

    renderer.domElement.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("click", onClick);

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      composer.render(); // 使用 composer 渲染以应用发光效果
    };
    animate();

    const onResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h); // 同时更新 composer 尺寸
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("click", onClick);
      composer.dispose();
      renderer.dispose();
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [onHoverComment, onClickComment]);

  // 创建 cube 的 12 条虚线边
  const createCubeEdges = (cubeSize) => {
    if (CUBE_EDGE_OPACITY <= 0) return null;

    const half = cubeSize / 2;
    const vertices = [
      // 8 个顶点
      [-half, -half, -half],
      [half, -half, -half],
      [half, half, -half],
      [-half, half, -half],
      [-half, -half, half],
      [half, -half, half],
      [half, half, half],
      [-half, half, half],
    ];

    // 12 条边的顶点索引对
    const edges = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0], // 后面
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4], // 前面
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7], // 连接前后
    ];

    const edgeGroup = new THREE.Group();

    const material = new THREE.LineDashedMaterial({
      color: CUBE_EDGE_COLOR,
      transparent: true,
      opacity: CUBE_EDGE_OPACITY,
      dashSize: CUBE_EDGE_DASH_SIZE,
      gapSize: CUBE_EDGE_GAP_SIZE,
    });

    edges.forEach(([i, j]) => {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...vertices[i]),
        new THREE.Vector3(...vertices[j]),
      ]);
      const line = new THREE.Line(geometry, material);
      line.computeLineDistances(); // 虚线需要这个
      edgeGroup.add(line);
    });

    return edgeGroup;
  };

  // 创建或获取某个周期的 cube group
  const getOrCreateCubeGroup = (scene, periodIndex) => {
    if (cubeGroupsRef.current.has(periodIndex)) {
      return cubeGroupsRef.current.get(periodIndex);
    }

    const group = new THREE.Group();
    const rotation = getCubeRotation(periodIndex);

    // 每层 cube 累积扭转
    group.rotation.x = rotation * 0.7;
    group.rotation.y = rotation;
    group.rotation.z = rotation * 0.4;

    const cubeSize = getCubeSize(periodIndex);

    // 添加虚线边框（跳过最内层的几个）
    if (periodIndex >= CUBE_EDGE_SKIP_INNER) {
      const edges = createCubeEdges(cubeSize);
      if (edges) {
        group.add(edges);
      }
    }

    // 添加时间标签
    const label = createCubeLabel(periodIndex, cubeSize);
    if (label) {
      group.add(label);
    }

    scene.add(group);
    cubeGroupsRef.current.set(periodIndex, group);
    return group;
  };

  // add meshes when slangs change
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    slangs.forEach((slang) => {
      if (meshesRef.current.has(slang.term)) return;

      const allComments = [];
      (slang.periods || []).forEach((p) => {
        (p.comments || []).forEach((c) => allComments.push(c));
      });

      if (allComments.length === 0) return;

      // 随机决定 cluster 数量：约一半 10 个，一半 5 个////////////////////////////////////////////
      const maxClusters = Math.random() > 0.1 ? 10 : 5;
      const clusters = splitIntoClustersByTime(allComments, maxClusters);

      clusters.forEach((cluster) => {
        const { arranged, cols, rows } = arrangeCluster(cluster);
        const periodIndex = getClusterPeriodIndex(cluster);
        const cubeSize = getCubeSize(periodIndex);
        const cubeGroup = getOrCreateCubeGroup(scene, periodIndex);

        const clusterGroup = new THREE.Group();
        clusterGroup.userData.isCluster = true;
        clusterGroup.userData.slangTerm = slang.term;

        // 查找可用的 slot（避免重叠）
        const { faceIndex, slotIndex } = findAvailableSlot(periodIndex);
        clusterGroup.userData.periodIndex = periodIndex;
        clusterGroup.userData.faceIndex = faceIndex;
        clusterGroup.userData.slotIndex = slotIndex;

        const { pos, lookDir, extraRotation } = getPositionOnCubeFace(
          cubeSize,
          faceIndex,
          slotIndex
        );

        clusterGroup.position.copy(pos);

        // 让簇面向外（从 cube 中心向外看）
        clusterGroup.lookAt(pos.clone().add(lookDir.multiplyScalar(100)));

        // 在面上随机旋转 (0°, 90°, 180°, 270°)
        clusterGroup.rotateZ(extraRotation);

        // 随机基础尺寸，增加参差感
        const randomBaseScale =
          CLUSTER_SIZE_MIN + Math.random() * (CLUSTER_SIZE_MAX - CLUSTER_SIZE_MIN);

        // 结合簇内数量调整（数量多时略小）
        const countAdjust = Math.max(0.7, Math.min(1.3, 10 / cluster.length));

        // 层级尺寸乘数：最内层(1-FACTOR)，中间层1，最外层(1+FACTOR)
        const totalPeriods = getTotalPeriods();
        const normalizedLayer = totalPeriods > 1 ? periodIndex / (totalPeriods - 1) : 0.5;
        const layerMultiplier = 1 + LAYER_SIZE_FACTOR * (normalizedLayer - 0.5) * 2;

        const sizeScale = randomBaseScale * countAdjust * layerMultiplier;

        const planeW = TILE_BASE_WIDTH * sizeScale;
        const planeH = TILE_BASE_HEIGHT * sizeScale;
        const gap = TILE_GAP * sizeScale;

        arranged.forEach((comment) => {
          const texture = createTextTexture(comment, sizeScale);
          const mat = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide,
            color: NORMAL_COLOR,
          });
          const geo = new THREE.PlaneGeometry(planeW, planeH);
          const mesh = new THREE.Mesh(geo, mat);

          mesh.position.set(
            (comment.gridX - cols / 2) * (planeW + gap),
            (comment.gridY - rows / 2) * (planeH + gap),
            0
          );

          mesh.userData.comment = comment;
          mesh.userData.slangTerm = slang.term;

          clusterGroup.add(mesh);
          allMeshesRef.current.push(mesh);
        });

        cubeGroup.add(clusterGroup);
      });

      meshesRef.current.set(slang.term, true);
    });
  }, [slangs]);

  // handle tempSlang (temporary search result)
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    // 清除旧的临时 meshes
    tempMeshesRef.current.forEach((mesh) => {
      // 从 allMeshesRef 中移除
      const idx = allMeshesRef.current.indexOf(mesh);
      if (idx > -1) allMeshesRef.current.splice(idx, 1);
    });
    tempMeshesRef.current = [];

    // 清除旧的临时 groups，并释放 slots
    tempGroupsRef.current.forEach((group) => {
      // 释放占用的 slot
      if (group.userData.periodIndex !== undefined) {
        releaseSlot(group.userData.periodIndex, group.userData.faceIndex, group.userData.slotIndex);
      }
      if (group.parent) group.parent.remove(group);
    });
    tempGroupsRef.current = [];

    // 如果没有 tempSlang，结束
    if (!tempSlang) return;

    // 如果这个 slang 已经在正式列表中，不需要创建临时 meshes
    if (meshesRef.current.has(tempSlang.term)) return;

    const allComments = [];
    (tempSlang.periods || []).forEach((p) => {
      (p.comments || []).forEach((c) => allComments.push(c));
    });

    if (allComments.length === 0) return;

    // 随机决定 cluster 数量：约一半 10 个，一半 5 个////////////////////////////////////////////
    const maxClusters = Math.random() > 0.3 ? 10 : 3;
    const clusters = splitIntoClustersByTime(allComments, maxClusters);

    clusters.forEach((cluster) => {
      const { arranged, cols, rows } = arrangeCluster(cluster);
      const periodIndex = getClusterPeriodIndex(cluster);
      const cubeSize = getCubeSize(periodIndex);
      const cubeGroup = getOrCreateCubeGroup(scene, periodIndex);

      const clusterGroup = new THREE.Group();
      clusterGroup.userData.isCluster = true;
      clusterGroup.userData.slangTerm = tempSlang.term;
      clusterGroup.userData.isTemp = true;

      // 查找可用的 slot（避免重叠）
      const { faceIndex, slotIndex } = findAvailableSlot(periodIndex);
      clusterGroup.userData.periodIndex = periodIndex;
      clusterGroup.userData.faceIndex = faceIndex;
      clusterGroup.userData.slotIndex = slotIndex;

      const { pos, lookDir, extraRotation } = getPositionOnCubeFace(cubeSize, faceIndex, slotIndex);

      clusterGroup.position.copy(pos);
      clusterGroup.lookAt(pos.clone().add(lookDir.multiplyScalar(100)));
      clusterGroup.rotateZ(extraRotation);

      const randomBaseScale =
        CLUSTER_SIZE_MIN + Math.random() * (CLUSTER_SIZE_MAX - CLUSTER_SIZE_MIN);
      const countAdjust = Math.max(0.7, Math.min(1.3, 10 / cluster.length));
      const totalPeriods = getTotalPeriods();
      const normalizedLayer = totalPeriods > 1 ? periodIndex / (totalPeriods - 1) : 0.5;
      const layerMultiplier = 1 + LAYER_SIZE_FACTOR * (normalizedLayer - 0.5) * 2;
      const sizeScale = randomBaseScale * countAdjust * layerMultiplier;

      const planeW = TILE_BASE_WIDTH * sizeScale;
      const planeH = TILE_BASE_HEIGHT * sizeScale;
      const gap = TILE_GAP * sizeScale;

      arranged.forEach((comment) => {
        const texture = createTextTexture(comment, sizeScale);
        const mat = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.DoubleSide,
          color: slangGlowColor.clone(), // 临时片默认高亮显示（带发光）
        });
        const geo = new THREE.PlaneGeometry(planeW, planeH);
        const mesh = new THREE.Mesh(geo, mat);

        mesh.position.set(
          (comment.gridX - cols / 2) * (planeW + gap),
          (comment.gridY - rows / 2) * (planeH + gap),
          0
        );

        mesh.userData.comment = comment;
        mesh.userData.slangTerm = tempSlang.term;
        mesh.userData.isTemp = true;

        clusterGroup.add(mesh);
        allMeshesRef.current.push(mesh);
        tempMeshesRef.current.push(mesh);
      });

      cubeGroup.add(clusterGroup);
      tempGroupsRef.current.push(clusterGroup);
    });
  }, [tempSlang]);

  // update highlight for slang (from search/click in sidebar)
  useEffect(() => {
    if (!sceneRef.current || !highlightSlang) return;
    if (allMeshesRef.current.length === 0) return;

    allMeshesRef.current.forEach((mesh) => {
      if (mesh.material) {
        if (mesh.userData.slangTerm === highlightSlang) {
          // 匹配的 slang：高亮为红色（带发光）
          mesh.material.color.copy(slangGlowColor);
        } else if (!mesh.userData.visited) {
          // 非匹配且未访问过：恢复灰色
          mesh.material.color.setHex(NORMAL_COLOR);
        }
        // 已访问过的片保持当前颜色（白色）
      }
    });
  }, [highlightSlang, slangs]); // 也依赖 slangs，确保 meshes 创建后能触发高亮

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
