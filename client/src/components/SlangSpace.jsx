import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

// split comments into exactly 5 clusters with varying sizes (5-25 each)
function splitIntoFiveClusters(comments) {
  if (!comments || comments.length === 0) return [];

  const shuffled = [...comments].sort(() => Math.random() - 0.5);
  const total = shuffled.length;

  // generate 5 random sizes that sum to total, each between 5-25
  let sizes = [];
  let remaining = total;

  for (let i = 0; i < 4; i++) {
    const maxForThis = Math.min(25, remaining - (4 - i) * 5);
    const minForThis = Math.max(5, remaining - (4 - i) * 25);
    const size = Math.floor(Math.random() * (maxForThis - minForThis + 1)) + minForThis;
    sizes.push(size);
    remaining -= size;
  }
  sizes.push(remaining); // last one gets the rest

  // if any size is out of range, just distribute evenly
  if (sizes.some((s) => s < 1)) {
    const each = Math.floor(total / 5);
    sizes = [each, each, each, each, total - each * 4];
  }

  const clusters = [];
  let idx = 0;
  for (const size of sizes) {
    if (size > 0) {
      clusters.push(shuffled.slice(idx, idx + size));
      idx += size;
    }
  }

  return clusters;
}

// pick aspect ratio with weighted random
function pickAspectRatio() {
  const r = Math.random();
  if (r < 0.53) return { cols: 2, rows: 1 }; // 1:2
  if (r < 0.63) return { cols: 1, rows: 1 }; // 1:1 square
  if (r < 0.73) return { cols: 3, rows: 2 }; // 1:3
  if (r < 0.83) return { cols: 4, rows: 3 }; // 1:4
  if (r < 0.9) return { cols: 5, rows: 6 }; // 1:5
  if (r < 0.95) return { cols: 4, rows: 1 }; // 1:10
  return { cols: 20, rows: 1 }; // 1:20
}

// arrange cluster into grid with given aspect preference
function arrangeCluster(comments) {
  const n = comments.length;
  const ratio = pickAspectRatio();

  // figure out grid size based on ratio preference
  let cols, rows;
  if (ratio.cols >= ratio.rows) {
    cols = Math.ceil(Math.sqrt((n * ratio.cols) / ratio.rows));
    rows = Math.ceil(n / cols);
  } else {
    rows = Math.ceil(Math.sqrt((n * ratio.rows) / ratio.cols));
    cols = Math.ceil(n / rows);
  }

  // clamp to reasonable values
  cols = Math.max(1, Math.min(cols, n));
  rows = Math.ceil(n / cols);

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

// create text texture - only comment text, bold
function createTextTexture(comment, scale = 1) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const w = Math.floor(512 * scale);
  const h = Math.floor(256 * scale);
  canvas.width = w;
  canvas.height = h;

  // white bg
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  // black bold text
  ctx.fillStyle = "#000000";
  const fontSize = Math.floor(16 * scale);
  ctx.font = `bold ${fontSize}px monospace`;

  // wrap text
  const text = comment.text || "";
  const words = text.split(" ");
  let line = "";
  let y = fontSize + 5;
  const maxWidth = w - 20;
  const lineHeight = fontSize + 4;

  for (const word of words) {
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

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    const w = containerRef.current.clientWidth;
    const h = containerRef.current.clientHeight;

    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 2000);
    camera.position.set(0, 0, 300);

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

      // check hover
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(allMeshesRef.current);

      if (intersects.length > 0) {
        const mesh = intersects[0].object;
        if (mesh !== hoveredMesh) {
          // unhighlight old
          if (hoveredMesh && hoveredMesh.material) {
            hoveredMesh.material.emissive?.setHex(0x000000);
          }
          hoveredMesh = mesh;
          // highlight new
          if (mesh.material) {
            if (!mesh.material.emissive) {
              mesh.material = new THREE.MeshBasicMaterial({
                map: mesh.material.map,
                side: THREE.DoubleSide,
              });
            }
          }
          onHoverComment(mesh.userData.comment, mesh.userData.slangTerm);
        }
      } else {
        if (hoveredMesh) {
          hoveredMesh = null;
          onHoverComment(null, null);
        }
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

    let time = 0;
    const animate = () => {
      requestAnimationFrame(animate);
      time += 0.0003;

      scene.children.forEach((group) => {
        if (group.userData.isCluster) {
          group.rotation.y = time * group.userData.speed;
        }
      });

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

  // add meshes when slangs change
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    slangs.forEach((slang) => {
      if (meshesRef.current.has(slang.term)) return;

      // collect all comments
      const allComments = [];
      (slang.periods || []).forEach((p) => {
        (p.comments || []).forEach((c) => allComments.push(c));
      });

      if (allComments.length === 0) return;

      const clusters = splitIntoFiveClusters(allComments);

      clusters.forEach((cluster, clusterIdx) => {
        const { arranged, cols, rows } = arrangeCluster(cluster);

        const group = new THREE.Group();
        group.userData.isCluster = true;
        group.userData.slangTerm = slang.term;
        group.userData.speed = 0.1 + Math.random() * 0.2;

        // smaller cluster = bigger rectangles
        const sizeScale = Math.max(0.8, Math.min(2, 15 / cluster.length));
        const planeW = 8 * sizeScale;
        const planeH = 4 * sizeScale;
        const gap = 0.3 * sizeScale;

        // position - spread out based on cluster index
        const dist = 80 + clusterIdx * 40 + Math.random() * 30;
        const theta = Math.random() * Math.PI * 2;
        const phi = (Math.random() - 0.5) * Math.PI * 0.8;

        group.position.set(
          dist * Math.cos(phi) * Math.cos(theta),
          dist * Math.sin(phi),
          dist * Math.cos(phi) * Math.sin(theta)
        );

        group.rotation.set(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI
        );

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

          group.add(mesh);
          allMeshesRef.current.push(mesh);
        });

        scene.add(group);
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
        mesh.material.opacity = isHighlight ? 1 : 0.5;
      }
    });
  }, [highlightSlang]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
