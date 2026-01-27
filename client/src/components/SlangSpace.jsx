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
/////////////////////////////////

// 按时间分簇
function splitIntoClustersByTime(comments) {
  if (!comments || comments.length === 0) return [];

  const sorted = [...comments].sort((a, b) => {
    const ta = a.time ? new Date(a.time).getTime() : Infinity;
    const tb = b.time ? new Date(b.time).getTime() : Infinity;
    return ta - tb;
  });

  // 分成 5 个簇
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

  const w = Math.floor(512 * scale);
  const h = Math.floor(256 * scale);
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

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let hoveredMesh = null;

    const onMouseMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(allMeshesRef.current);

      if (intersects.length > 0) {
        const mesh = intersects[0].object;
        if (mesh !== hoveredMesh) {
          if (hoveredMesh && hoveredMesh.material) {
            hoveredMesh.material.opacity = 0.9;
          }
          hoveredMesh = mesh;
          if (mesh.material) {
            mesh.material.opacity = 1.0;
          }
          onHoverComment(mesh.userData.comment, mesh.userData.slangTerm);
        }
      } else {
        if (hoveredMesh && hoveredMesh.material) {
          hoveredMesh.material.opacity = 0.9;
        }
        hoveredMesh = null;
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

        const sizeScale = Math.max(0.8, Math.min(2, 15 / cluster.length));
        const planeW = TILE_BASE_WIDTH * sizeScale;
        const planeH = TILE_BASE_HEIGHT * sizeScale;
        const gap = TILE_GAP * sizeScale;

        arranged.forEach((comment) => {
          const texture = createTextTexture(comment, sizeScale);
          const mat = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9,
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
