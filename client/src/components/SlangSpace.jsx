import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass";

/////////////////////////////////

const TEXT_FONT_SIZE = 40;
const TILE_BASE_WIDTH = 5;
const TILE_BASE_HEIGHT = 3;
const TILE_GAP = 1.5;
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

/////////////////////////////////
// cube of time
const START_YEAR = 2019;
const START_MONTH = 1;
const MONTHS_PER_CUBE = 6; /////////////
const END_YEAR = 2025;
const END_MONTH = 12; //  cutoff

function getDatePeriodIndex(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-12

  const startMonths = START_YEAR * 12 + START_MONTH;
  const currentMonths = year * 12 + month;
  const monthsDiff = currentMonths - startMonths;

  return Math.floor(monthsDiff / MONTHS_PER_CUBE);
}

function getTotalPeriods() {
  const startMonths = START_YEAR * 12 + START_MONTH;
  const endMonths = END_YEAR * 12 + END_MONTH;
  return Math.ceil((endMonths - startMonths) / MONTHS_PER_CUBE);
}

////label
function getPeriodLabel(periodIndex) {
  const startMonths = START_YEAR * 12 + START_MONTH;
  const periodStartMonths = startMonths + periodIndex * MONTHS_PER_CUBE;

  const startYear = Math.floor((periodStartMonths - 1) / 12);
  const startMonth = ((periodStartMonths - 1) % 12) + 1;

  return `${startYear}.${startMonth}`;
}

function getClusterPeriodIndex(cluster) {
  const validTimes = cluster.filter((c) => c.time).map((c) => new Date(c.time).getTime());
  if (validTimes.length === 0) {
    return getTotalPeriods() - 1;
  }
  const avgTime = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
  return getDatePeriodIndex(new Date(avgTime));
}

/////////////////////cube size
const INNER_CUBE_SIZE = 60; // inner cube
const OUTER_CUBE_SIZE = 360; // biggest cube
const CUBE_TWIST = 0.7;

//cube size by time squence
function getCubeSize(periodIndex) {
  const total = getTotalPeriods();
  const clampedIndex = Math.max(0, Math.min(total - 1, periodIndex));
  const ratio = total > 1 ? clampedIndex / (total - 1) : 0;
  return INNER_CUBE_SIZE + ratio * (OUTER_CUBE_SIZE - INNER_CUBE_SIZE);
}

function getCubeRotation(periodIndex) {
  return periodIndex * CUBE_TWIST;
}

/////////////////////////////////
///Slot
const GRID_SIZE = 4;
const TOTAL_SLOTS = GRID_SIZE * GRID_SIZE;
const SLOT_JITTER = 0.08; ////

const EDGE_SLOTS = [0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15];
const MIDDLE_SLOTS = [5, 6, 9, 10];

//uv position in each face
function getSlotBasePosition(slotIndex) {
  const row = Math.floor(slotIndex / GRID_SIZE);
  const col = slotIndex % GRID_SIZE;
  //0.7
  const u = -0.7 + (col / (GRID_SIZE - 1)) * 1.4;
  const v = -0.7 + (row / (GRID_SIZE - 1)) * 1.4;
  return { u, v };
}

function getPositionOnCubeFace(cubeSize, faceIndex, slotIndex) {
  const half = cubeSize / 2;

  const basePos = getSlotBasePosition(slotIndex);
  const u = (basePos.u + (Math.random() - 0.5) * SLOT_JITTER * 2) * half;
  const v = (basePos.v + (Math.random() - 0.5) * SLOT_JITTER * 2) * half;
  //fix rotation
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

///comment incluster
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

/////////////////////
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

///////////// fake background tiles
const BG_TILE_COUNT = 1000;
const BG_MIN_DIST = 390;
const BG_MAX_DIST = 500;
const BG_OPACITY = 0.3;
function createBackgroundTiles(scene) {
  const geo = new THREE.PlaneGeometry(TILE_BASE_WIDTH * 1.5, TILE_BASE_HEIGHT * 1.5);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x888888,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: BG_OPACITY,
  });

  for (let i = 0; i < BG_TILE_COUNT; i++) {
    const mesh = new THREE.Mesh(geo, mat);

    //llm
    const dist = BG_MIN_DIST + Math.random() * (BG_MAX_DIST - BG_MIN_DIST);
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * Math.PI;

    mesh.position.set(
      dist * Math.cos(phi) * Math.cos(theta),
      dist * Math.sin(phi),
      dist * Math.cos(phi) * Math.sin(theta)
    );
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    mesh.userData.isBackground = true;

    scene.add(mesh);
  }
}

/////////////////////////////Cube label(time label)
const CUBE_LABEL_OPACITY = 1;
const CUBE_LABEL_SIZE = 8;

function createCubeLabel(periodIndex, cubeSize) {
  if (CUBE_LABEL_OPACITY <= 0) return null;

  const label = getPeriodLabel(periodIndex);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 1024;
  canvas.height = 128;

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
    alphaTest: 0.1, //llm
  });

  //placement
  const aspect = canvas.width / canvas.height;
  const labelHeight = CUBE_LABEL_SIZE;
  const labelWidth = labelHeight * aspect;
  const geo = new THREE.PlaneGeometry(labelWidth, labelHeight);
  const mesh = new THREE.Mesh(geo, material);

  const half = cubeSize / 2;
  mesh.position.set(-half + labelWidth / 2, half + 0.1, -half + labelHeight / 2);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.y = 0;
  mesh.rotation.z = 0;

  return mesh;
}

/////////////////////////////////
//hilight colors
const NORMAL_COLOR = 0x999999;
const HIGHLIGHT_COLOR = 0xffffff; //directly hovered
const SLANG_HIGHLIGHT_COLOR = 0xe6e070; //same slang
//bloom, llm
const BLOOM_STRENGTH = 0.7;
const BLOOM_RADIUS = 0.4;
const BLOOM_THRESHOLD = 0.5; /////
const SLANG_GLOW_BRIGHTNESS = 1.1;

const slangGlowColor = new THREE.Color(SLANG_HIGHLIGHT_COLOR).multiplyScalar(SLANG_GLOW_BRIGHTNESS);

//connect line
const CONNECTION_LINE_WIDTH = 2;
const SLANG_LABEL_SIZE = 12;
const SLANG_LABEL_OFFSET = 15;
function createSlangLabel(text) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 512;
  canvas.height = 128;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const r = Math.min(255, Math.floor(slangGlowColor.r * 255));
  const g = Math.min(255, Math.floor(slangGlowColor.g * 255));
  const b = Math.min(255, Math.floor(slangGlowColor.b * 255));
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.font = "bold 64px 'Consolas', 'Monaco', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });

  const sprite = new THREE.Sprite(material);
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(SLANG_LABEL_SIZE * aspect, SLANG_LABEL_SIZE, 1);

  return sprite;
}

/////////////////////////////////
///zoom limits
const ZOOM_MIN = 80;
const ZOOM_MAX = 400;
// Cube edge
const CUBE_EDGE_OPACITY = 0.83;
const CUBE_EDGE_COLOR = 0x989898;
const CUBE_EDGE_DASH_SIZE = 0.5;
const CUBE_EDGE_GAP_SIZE = 2;
const CUBE_EDGE_SKIP_INNER = 2;

const CLUSTER_SIZE_MIN = 0.8;
const CLUSTER_SIZE_MAX = 2.0;
const LAYER_SIZE_FACTOR = 0.1;

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
  const tempMeshesRef = useRef([]); //temp
  const tempGroupsRef = useRef([]);
  const cubeGroupsRef = useRef(new Map()); // periodIndex -> Group
  const occupiedSlotsRef = useRef(new Map()); //true
  const slangClustersRef = useRef(new Map());
  const connectionObjectsRef = useRef([]);

  //find slot, algorithm by llm
  const findAvailableSlot = (periodIndex) => {
    const faces = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
    const edgeSlots = [...EDGE_SLOTS].sort(() => Math.random() - 0.5);
    const middleSlots = [...MIDDLE_SLOTS].sort(() => Math.random() - 0.5);

    for (const faceIndex of faces) {
      for (const slotIndex of edgeSlots) {
        const key = `${periodIndex}-${faceIndex}-${slotIndex}`;
        if (!occupiedSlotsRef.current.has(key)) {
          occupiedSlotsRef.current.set(key, true);
          return { faceIndex, slotIndex };
        }
      }
    }

    //middle
    for (const faceIndex of faces) {
      for (const slotIndex of middleSlots) {
        const key = `${periodIndex}-${faceIndex}-${slotIndex}`;
        if (!occupiedSlotsRef.current.has(key)) {
          occupiedSlotsRef.current.set(key, true);
          return { faceIndex, slotIndex };
        }
      }
    }

    //full
    const faceIndex = Math.floor(Math.random() * 6);
    const slotIndex = EDGE_SLOTS[Math.floor(Math.random() * EDGE_SLOTS.length)];
    return { faceIndex, slotIndex };
  };

  //clear temp slot meshes
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

    //after bloom
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

    createBackgroundTiles(scene);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let hoveredSlang = null;
    let directHoveredMesh = null;

    const clearConnections = () => {
      connectionObjectsRef.current.forEach((obj) => {
        if (obj.parent) obj.parent.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      });
      connectionObjectsRef.current = [];
    };

    //create connections
    const createConnections = (slangTerm) => {
      const clusters = slangClustersRef.current.get(slangTerm);
      if (!clusters || clusters.length < 2) return;

      // sort by avgTime
      const sorted = [...clusters].sort((a, b) => a.avgTime - b.avgTime);

      // get world positions
      const positions = sorted.map(({ group, cubeGroup }) => {
        const worldPos = new THREE.Vector3();
        group.getWorldPosition(worldPos);
        return worldPos;
      });

      const lineGeometry = new THREE.BufferGeometry().setFromPoints(positions);
      const lineMaterial = new THREE.LineBasicMaterial({
        color: slangGlowColor,
        linewidth: CONNECTION_LINE_WIDTH,
      });
      const line = new THREE.Line(lineGeometry, lineMaterial);
      scene.add(line);
      connectionObjectsRef.current.push(line);

      // add label at first cluster
      const label = createSlangLabel(slangTerm);

      // calculate label position: at first cluster, offset along direction from second to first
      const firstPos = positions[0];
      const secondPos = positions[1];
      const direction = new THREE.Vector3().subVectors(firstPos, secondPos).normalize();
      const labelPos = firstPos.clone().add(direction.multiplyScalar(SLANG_LABEL_OFFSET));

      label.position.copy(labelPos);
      scene.add(label);
      connectionObjectsRef.current.push(label);
    };

    const onMouseMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(allMeshesRef.current);

      if (intersects.length > 0) {
        const mesh = intersects[0].object;
        const slangTerm = mesh.userData.slangTerm;

        if (mesh !== directHoveredMesh) {
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
          if (hoveredSlang) {
            allMeshesRef.current.forEach((m) => {
              if (m.userData.slangTerm === hoveredSlang && m.material) {
                //restore
                m.material.color.setHex(m.userData.visited ? HIGHLIGHT_COLOR : NORMAL_COLOR);
              }
            });
            clearConnections();
          }

          hoveredSlang = slangTerm;
          allMeshesRef.current.forEach((m) => {
            if (m.userData.slangTerm === slangTerm && m.material) {
              if (m === mesh) {
                m.material.color.setHex(HIGHLIGHT_COLOR);
              } else {
                m.material.color.copy(slangGlowColor);
              }
            }
          });

          createConnections(slangTerm);
        }
      } else {
        //mouse out
        if (hoveredSlang) {
          allMeshesRef.current.forEach((m) => {
            if (m.userData.slangTerm === hoveredSlang && m.material) {
              m.material.color.setHex(m.userData.visited ? HIGHLIGHT_COLOR : NORMAL_COLOR);
            }
          });
          clearConnections();
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
      composer.render(); //bloom////
    };
    animate();

    const onResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h); //update composer size
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("click", onClick);
      clearConnections();
      composer.dispose();
      renderer.dispose();
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [onHoverComment, onClickComment]);

  //edge lines
  const createCubeEdges = (cubeSize) => {
    if (CUBE_EDGE_OPACITY <= 0) return null;

    const half = cubeSize / 2;
    const vertices = [
      [-half, -half, -half],
      [half, -half, -half],
      [half, half, -half],
      [-half, half, -half],
      [-half, -half, half],
      [half, -half, half],
      [half, half, half],
      [-half, half, half],
    ];

    const edges = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
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
      line.computeLineDistances(); ///dashed
      edgeGroup.add(line);
    });

    return edgeGroup;
  };

  // get or create cube group for a period
  const getOrCreateCubeGroup = (scene, periodIndex) => {
    if (cubeGroupsRef.current.has(periodIndex)) {
      return cubeGroupsRef.current.get(periodIndex);
    }

    const group = new THREE.Group();
    const rotation = getCubeRotation(periodIndex);

    group.rotation.x = rotation * 0.7;
    group.rotation.y = rotation;
    group.rotation.z = rotation * 0.4;

    const cubeSize = getCubeSize(periodIndex);

    if (periodIndex >= CUBE_EDGE_SKIP_INNER) {
      const edges = createCubeEdges(cubeSize);
      if (edges) {
        group.add(edges);
      }
    }

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

      // 随机决定 cluster 数量：约一半 10 个，一半 5 个////////
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

        //find slot
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

        // calculate avg time for cluster
        const avgTime =
          cluster.reduce((sum, c) => {
            return sum + (c.time ? new Date(c.time).getTime() : Date.now());
          }, 0) / cluster.length;

        if (!slangClustersRef.current.has(slang.term)) {
          slangClustersRef.current.set(slang.term, []);
        }
        slangClustersRef.current.get(slang.term).push({
          group: clusterGroup,
          avgTime,
          cubeGroup,
        });
      });

      meshesRef.current.set(slang.term, true);
    });
  }, [slangs]);

  //  tempSlang (temporary search result) llm
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    tempMeshesRef.current.forEach((mesh) => {
      const idx = allMeshesRef.current.indexOf(mesh);
      if (idx > -1) allMeshesRef.current.splice(idx, 1);
    });
    tempMeshesRef.current = [];

    tempGroupsRef.current.forEach((group) => {
      // release slot
      if (group.userData.periodIndex !== undefined) {
        releaseSlot(group.userData.periodIndex, group.userData.faceIndex, group.userData.slotIndex);
      }
      if (group.parent) group.parent.remove(group);
    });
    tempGroupsRef.current = [];

    slangClustersRef.current.forEach((clusters, term) => {
      const filtered = clusters.filter((c) => !c.isTemp);
      if (filtered.length === 0) {
        slangClustersRef.current.delete(term);
      } else {
        slangClustersRef.current.set(term, filtered);
      }
    });

    if (!tempSlang) return;

    // avoid duplicate
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

      // find slot
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
          color: slangGlowColor.clone(), // highlight
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

      const avgTime =
        cluster.reduce((sum, c) => {
          return sum + (c.time ? new Date(c.time).getTime() : Date.now());
        }, 0) / cluster.length;

      if (!slangClustersRef.current.has(tempSlang.term)) {
        slangClustersRef.current.set(tempSlang.term, []);
      }
      slangClustersRef.current.get(tempSlang.term).push({
        group: clusterGroup,
        avgTime,
        cubeGroup,
        isTemp: true,
      });
    });
  }, [tempSlang]);

  // update highlight for slang (from search/click in sidebar)
  useEffect(() => {
    if (!sceneRef.current || !highlightSlang) return;
    if (allMeshesRef.current.length === 0) return;

    allMeshesRef.current.forEach((mesh) => {
      if (mesh.material) {
        if (mesh.userData.slangTerm === highlightSlang) {
          // same slang
          mesh.material.color.copy(slangGlowColor);
        } else if (!mesh.userData.visited) {
          // restore
          mesh.material.color.setHex(NORMAL_COLOR);
        }
        //visited
      }
    });
  }, [highlightSlang, slangs]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
