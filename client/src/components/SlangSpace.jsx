import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

/////////////////////////////////
// 可调参数
const TEXT_FONT_SIZE = 56;
const TILE_BASE_WIDTH = 5;
const TILE_BASE_HEIGHT = 3;
const TILE_GAP = 0.3;

// cube 时间相关
const START_YEAR = 2019;
const START_MONTH = 1; // 起始月份 (1-12)
const MONTHS_PER_CUBE = 6; // 每个 cube 代表几个月
const END_YEAR = 2025;
const END_MONTH = 12; // 结束月份

// cube 尺寸相关
const INNER_CUBE_SIZE = 40; // 最内层 cube 的大小
const OUTER_CUBE_SIZE = 320; // 最外层 cube 的大小
const CUBE_TWIST = 0.7; // 每层 cube 之间的扭转角度 (弧度)

// 背景假片相关
const BG_TILE_COUNT = 900; // 背景假片数量
const BG_MIN_DIST = 350; // 假片最近距离
const BG_MAX_DIST = 500; // 假片最远距离
const BG_OPACITY = 0.3; // 假片透明度

// 缩放限制
const ZOOM_MIN = 80; // 最近
const ZOOM_MAX = 400; // 最远

// 高亮相关
const NORMAL_OPACITY = 0.5; // 非高亮时的透明度
const DIRECT_HIGHLIGHT_OPACITY = 1.0; // 直接悬停的片
const SLANG_HIGHLIGHT_OPACITY = 0.7; // 同 slang 其他片
const VISITED_OPACITY = 0.7; // 被直接悬停过后离开的片

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
/////////////////////////////////

// 按时间分簇
function splitIntoClustersByTime(comments) {
  if (!comments || comments.length === 0) return [];

  const sorted = [...comments].sort((a, b) => {
    const ta = a.time ? new Date(a.time).getTime() : Infinity;
    const tb = b.time ? new Date(b.time).getTime() : Infinity;
    return ta - tb;
  });

  // 分成 10 个簇
  const total = sorted.length;
  const clusterCount = Math.min(10, total);
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

// 在 cube 的某个面上靠近边缘放置
function getPositionOnCubeFace(cubeSize, faceIndex) {
  const half = cubeSize / 2;

  // 在面上的位置，靠近边缘
  const edgeBias = 0.7 + Math.random() * 0.25; // 0.7-0.95，靠近边缘
  const u = (Math.random() > 0.5 ? 1 : -1) * edgeBias * half;
  const v = (Math.random() - 0.5) * 2 * half * 0.9;

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

// 创建文字贴图 - 只显示前 5 个词
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
  const words = text.split(" ").slice(0, 5);
  const preview = words.join(" ") + (text.split(" ").length > 5 ? "..." : "");

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

export default function SlangSpace({ slangs, highlightSlang, onHoverComment, onClickComment }) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const meshesRef = useRef(new Map());
  const allMeshesRef = useRef([]);
  const cubeGroupsRef = useRef(new Map()); // year -> Group

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
    containerRef.current.appendChild(renderer.domElement);

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
          // 之前直接悬停的片降为 slang 高亮
          if (
            directHoveredMesh &&
            directHoveredMesh.material &&
            directHoveredMesh.userData.slangTerm === slangTerm
          ) {
            directHoveredMesh.material.opacity = SLANG_HIGHLIGHT_OPACITY;
          }

          directHoveredMesh = mesh;
          mesh.userData.visited = true;
          mesh.material.opacity = DIRECT_HIGHLIGHT_OPACITY;

          onHoverComment(mesh.userData.comment, slangTerm);
        }

        if (slangTerm !== hoveredSlang) {
          // 取消之前高亮的 slang
          if (hoveredSlang) {
            allMeshesRef.current.forEach((m) => {
              if (m.userData.slangTerm === hoveredSlang && m.material) {
                m.material.opacity = m.userData.visited ? VISITED_OPACITY : NORMAL_OPACITY;
              }
            });
          }

          // 高亮新的 slang 的所有片
          hoveredSlang = slangTerm;
          allMeshesRef.current.forEach((m) => {
            if (m.userData.slangTerm === slangTerm && m.material) {
              // 直接悬停的片 1.0，其他同 slang 的 0.7
              m.material.opacity = m === mesh ? DIRECT_HIGHLIGHT_OPACITY : SLANG_HIGHLIGHT_OPACITY;
            }
          });
        }
      } else {
        // 鼠标离开所有片
        if (hoveredSlang) {
          allMeshesRef.current.forEach((m) => {
            if (m.userData.slangTerm === hoveredSlang && m.material) {
              // 被直接悬停过的用 VISITED，否则用 NORMAL
              m.material.opacity = m.userData.visited ? VISITED_OPACITY : NORMAL_OPACITY;
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
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("click", onClick);
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

    // 添加虚线边框（跳过最内层的几个）
    if (periodIndex >= CUBE_EDGE_SKIP_INNER) {
      const cubeSize = getCubeSize(periodIndex);
      const edges = createCubeEdges(cubeSize);
      if (edges) {
        group.add(edges);
      }
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

      const clusters = splitIntoClustersByTime(allComments);

      clusters.forEach((cluster) => {
        const { arranged, cols, rows } = arrangeCluster(cluster);
        const periodIndex = getClusterPeriodIndex(cluster);
        const cubeSize = getCubeSize(periodIndex);
        const cubeGroup = getOrCreateCubeGroup(scene, periodIndex);

        const clusterGroup = new THREE.Group();
        clusterGroup.userData.isCluster = true;
        clusterGroup.userData.slangTerm = slang.term;

        // 随机选一个面
        const faceIndex = Math.floor(Math.random() * 6);
        const { pos, lookDir, extraRotation } = getPositionOnCubeFace(cubeSize, faceIndex);

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
            transparent: true,
            opacity: NORMAL_OPACITY,
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

  // update highlight for slang
  useEffect(() => {
    if (!sceneRef.current) return;

    allMeshesRef.current.forEach((mesh) => {
      if (mesh.material) {
        const isHighlight = mesh.userData.slangTerm === highlightSlang;
        mesh.material.color = isHighlight
          ? new THREE.Color(1.3, 1.3, 1.3)
          : new THREE.Color(1, 1, 1);
      }
    });
  }, [highlightSlang]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
