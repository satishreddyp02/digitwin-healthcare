import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * Photorealistic 3D Cardiac Digital Twin Visualization (Three.js WebGL)
 * 
 * Biophysical Mappings from 0D Windkessel & Patient State:
 * 1. Pumping Frequency: Synchronized to exact patient / simulated HR (T_cycle = 60 / HR).
 * 2. Ventricular Stroke Volume Ejection: Wall contraction amplitude mapped to Ejection Fraction (EF).
 * 3. Aortic Root Compliance Pulsation: Aortic expansion & recoil driven by MAP and Pulse Pressure.
 * 4. Cardiac Output (CO): Live calculation as HR * (EDV * EF) / 1000 L/min.
 * 5. Anatomical Coronal Dissection: True Left Ventricular cavity cutaway with:
 *    - 12 mm muscular myocardium wall thickness cross-section
 *    - Ruby endocardial cavity lumen
 *    - Anterolateral and posteromedial papillary muscle columns
 *    - White fibrous chordae tendineae (heart strings)
 *    - Mitral valve annulus
 *    - Interventricular septum (IVS)
 */
export default function Heart3D({ sbp = 120, dbp = 80, hr = 72, ef = 55, edv = 120 }) {
  const mountRef = useRef(null);
  const [showLabels, setShowLabels] = useState(true);
  const [crossSection, setCrossSection] = useState(false);
  const [activePreset, setActivePreset] = useState("anterior"); // "anterior" | "lateral" | "superior" | "posterior"

  // Hemodynamic metrics
  const efFrac = Math.min(0.85, Math.max(0.15, ef / 100));
  const esv = Math.round(edv * (1 - efFrac));
  const sv = Math.round(edv * efFrac);
  const co = ((hr * sv) / 1000).toFixed(2);
  const map = (dbp + (sbp - dbp) / 3).toFixed(1);

  // References to dynamic 3D meshes for animation
  const heartGroupRef = useRef(null);
  const ventriclesRef = useRef(null);
  const aortaRef = useRef(null);
  const cameraRef = useRef(null);
  const isDraggingRef = useRef(false);
  const mousePosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene, Camera, Renderer
    const width = container.clientWidth || 640;
    const height = container.clientHeight || 420;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc); // Clean neutral slate

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0, 16);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // CRITICAL: Enable local clipping planes for true anatomical cutaway!
    renderer.localClippingEnabled = true;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // 2. Realistic Procedural Myocardial Texture
    const textureCanvas = document.createElement("canvas");
    textureCanvas.width = 512;
    textureCanvas.height = 512;
    const tCtx = textureCanvas.getContext("2d");

    // Base deep myocardium tone
    tCtx.fillStyle = "#871C2B";
    tCtx.fillRect(0, 0, 512, 512);

    // Myocardial fiber striations & noise
    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const len = 8 + Math.random() * 24;
      const angle = (y / 512) * Math.PI * 0.4 + (Math.random() - 0.5) * 0.2;
      tCtx.strokeStyle = Math.random() > 0.5 ? "rgba(163, 38, 56, 0.35)" : "rgba(105, 18, 30, 0.45)";
      tCtx.lineWidth = 1 + Math.random() * 2;
      tCtx.beginPath();
      tCtx.moveTo(x, y);
      tCtx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      tCtx.stroke();
    }

    // Epicardial adipose tissue streaks (fat deposits in sulci)
    const fatGrad = tCtx.createLinearGradient(180, 0, 320, 512);
    fatGrad.addColorStop(0, "rgba(207, 165, 115, 0.0)");
    fatGrad.addColorStop(0.45, "rgba(207, 165, 115, 0.25)");
    fatGrad.addColorStop(0.55, "rgba(207, 165, 115, 0.25)");
    fatGrad.addColorStop(1, "rgba(207, 165, 115, 0.0)");
    tCtx.fillStyle = fatGrad;
    tCtx.fillRect(150, 0, 200, 512);

    const heartTexture = new THREE.CanvasTexture(textureCanvas);
    heartTexture.wrapS = THREE.RepeatWrapping;
    heartTexture.wrapT = THREE.RepeatWrapping;

    // 3. Local Cutting Plane for Ventricular Coronal Dissection
    const localCutPlane = new THREE.Plane(new THREE.Vector3(0.18, 0.0, -1).normalize(), 0.12);
    const worldCutPlane = new THREE.Plane();

    // 4. PBR Materials with Wet Specular Clearcoat
    const muscleMaterial = new THREE.MeshPhysicalMaterial({
      map: heartTexture,
      color: 0x93202f,
      roughness: 0.38,
      metalness: 0.05,
      clearcoat: 0.45,
      clearcoatRoughness: 0.2,
      reflectivity: 0.6,
      side: crossSection ? THREE.DoubleSide : THREE.FrontSide,
      clippingPlanes: crossSection ? [worldCutPlane] : [],
      clipShadows: true,
    });

    const aortaMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xa82835,
      roughness: 0.3,
      metalness: 0.08,
      clearcoat: 0.5,
      clearcoatRoughness: 0.15,
    });

    const pulmonaryMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x2b5b88,
      roughness: 0.35,
      metalness: 0.06,
      clearcoat: 0.4,
      clearcoatRoughness: 0.2,
    });

    const venaCavaMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x1f456e,
      roughness: 0.4,
      metalness: 0.05,
      clearcoat: 0.3,
    });

    const coronaryArteryMaterial = new THREE.MeshStandardMaterial({
      color: 0xd92638,
      roughness: 0.25,
      metalness: 0.1,
      clippingPlanes: crossSection ? [worldCutPlane] : [],
      clipShadows: true,
    });

    // 5. Photorealistic Multi-Point Surgical Lighting
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.45);
    keyLight.position.set(6, 8, 10);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xffa8b5, 1.15); // Warm biological rim light
    rimLight.position.set(-8, -4, -6);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0x8cb5df, 0.75); // Subtle deoxygenated blue fill
    fillLight.position.set(-6, 6, 6);
    scene.add(fillLight);

    const cavityLight = new THREE.PointLight(0xff99aa, crossSection ? 1.6 : 0, 10);
    cavityLight.position.set(0.4, 0.3, 1.8);
    scene.add(cavityLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    // 6. Construct Anatomical Organ Meshes in Root Group
    const heartGroup = new THREE.Group();
    scene.add(heartGroup);
    heartGroupRef.current = heartGroup;

    // Slight anatomical tilt
    heartGroup.rotation.z = THREE.MathUtils.degToRad(-15);
    heartGroup.rotation.y = THREE.MathUtils.degToRad(-12);
    heartGroup.position.set(0, -0.6, 0);

    // --- VENTRICLES (Conical Prolate Anatomy) ---
    const ventGroup = new THREE.Group();
    heartGroup.add(ventGroup);
    ventriclesRef.current = ventGroup;

    // Left Ventricle (Thick muscular apex-pointing body)
    const lvGeo = new THREE.SphereGeometry(2.3, 36, 36);
    lvGeo.scale(1.0, 1.45, 0.95);
    // Deform apex tapering
    const lvPos = lvGeo.attributes.position;
    for (let i = 0; i < lvPos.count; i++) {
      const y = lvPos.getY(i);
      if (y < 0) {
        const factor = 1 - Math.abs(y / 3.4) * 0.48;
        lvPos.setX(i, lvPos.getX(i) * factor);
        lvPos.setZ(i, lvPos.getZ(i) * factor);
      }
    }
    lvGeo.computeVertexNormals();

    const lvMesh = new THREE.Mesh(lvGeo, muscleMaterial);
    lvMesh.position.set(0.3, 0.2, 0);
    lvMesh.rotation.z = THREE.MathUtils.degToRad(-10);
    ventGroup.add(lvMesh);

    // Right Ventricle (Crescentic wrapper along anterior-lateral aspect)
    const rvGeo = new THREE.SphereGeometry(1.9, 28, 28);
    rvGeo.scale(0.85, 1.3, 0.75);
    const rvMesh = new THREE.Mesh(rvGeo, muscleMaterial);
    rvMesh.position.set(-1.1, 0.5, 0.4);
    rvMesh.rotation.z = THREE.MathUtils.degToRad(8);
    ventGroup.add(rvMesh);

    // --- INTERNAL ANATOMICAL DISSECTION STRUCTURES (LV CAVITY) ---
    if (crossSection) {
      const cavityGroup = new THREE.Group();
      cavityGroup.position.set(0.3, 0.2, 0);
      cavityGroup.rotation.z = THREE.MathUtils.degToRad(-10);
      ventGroup.add(cavityGroup);

      // A. Deep Ruby Endocardial Cavity Lining
      const endoGeo = new THREE.SphereGeometry(1.82, 32, 32);
      endoGeo.scale(0.82, 1.32, 0.75);
      const endoPos = endoGeo.attributes.position;
      for (let i = 0; i < endoPos.count; i++) {
        const y = endoPos.getY(i);
        if (y < 0) {
          const factor = 1 - Math.abs(y / 3.2) * 0.45;
          endoPos.setX(i, endoPos.getX(i) * factor);
          endoPos.setZ(i, endoPos.getZ(i) * factor);
        }
      }
      endoGeo.computeVertexNormals();

      const endoMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x560814, // Deep rich ruby endocardium
        roughness: 0.4,
        metalness: 0.05,
        clearcoat: 0.5,
        clearcoatRoughness: 0.15,
        side: THREE.BackSide,
      });
      const endoMesh = new THREE.Mesh(endoGeo, endoMaterial);
      endoMesh.position.set(0, 0, -0.05);
      cavityGroup.add(endoMesh);

      // B. Cut Myocardial Wall Thickness (12 mm Wall Cross-Section Edge)
      const wallShape = new THREE.Shape();
      wallShape.absellipse(0, -0.15, 2.08, 2.82, 0, Math.PI * 2, false, 0);
      const holePath = new THREE.Path();
      holePath.absellipse(0, -0.15, 1.48, 2.18, 0, Math.PI * 2, true, 0);
      wallShape.holes.push(holePath);

      const wallGeo = new THREE.ShapeGeometry(wallShape, 32);
      const wallCutMaterial = new THREE.MeshStandardMaterial({
        color: 0x8a1826, // Muscular myocardial cross-section
        roughness: 0.55,
        metalness: 0.04,
        side: THREE.DoubleSide,
      });
      const cutWallMesh = new THREE.Mesh(wallGeo, wallCutMaterial);
      cutWallMesh.position.set(0.04, 0, 0.13);
      cutWallMesh.rotation.y = THREE.MathUtils.degToRad(-10);
      cavityGroup.add(cutWallMesh);

      // C. Interventricular Septum (IVS)
      const septumGeo = new THREE.BoxGeometry(0.55, 3.1, 1.8);
      const septumMaterial = new THREE.MeshStandardMaterial({
        color: 0x7c1422,
        roughness: 0.5,
      });
      const septumMesh = new THREE.Mesh(septumGeo, septumMaterial);
      septumMesh.position.set(-0.95, -0.1, -0.2);
      cavityGroup.add(septumMesh);

      // D. Papillary Muscles
      const papMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x7a1120,
        roughness: 0.38,
        clearcoat: 0.4,
      });

      // Anterolateral Papillary Muscle Column
      const pap1Curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.55, -1.3, -0.25),
        new THREE.Vector3(-0.45, -0.6, -0.05),
        new THREE.Vector3(-0.35, 0.35, 0.02),
      ]);
      const pap1Mesh = new THREE.Mesh(
        new THREE.TubeGeometry(pap1Curve, 16, 0.22, 12, false),
        papMaterial
      );
      cavityGroup.add(pap1Mesh);

      // Posteromedial Papillary Muscle Column
      const pap2Curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.5, -1.35, -0.3),
        new THREE.Vector3(0.42, -0.65, -0.15),
        new THREE.Vector3(0.32, 0.3, -0.05),
      ]);
      const pap2Mesh = new THREE.Mesh(
        new THREE.TubeGeometry(pap2Curve, 16, 0.2, 12, false),
        papMaterial
      );
      cavityGroup.add(pap2Mesh);

      // E. Chordae Tendineae (Fibrous Heart Strings)
      const chordaeMaterial = new THREE.MeshStandardMaterial({
        color: 0xf8fafc, // Pearly white fibrous tendons
        roughness: 0.25,
        metalness: 0.02,
      });

      const chordaePoints = [
        [new THREE.Vector3(-0.35, 0.35, 0.02), new THREE.Vector3(-0.4, 1.4, -0.1)],
        [new THREE.Vector3(-0.35, 0.35, 0.02), new THREE.Vector3(-0.15, 1.45, -0.02)],
        [new THREE.Vector3(-0.35, 0.35, 0.02), new THREE.Vector3(0.1, 1.42, -0.08)],
        [new THREE.Vector3(0.32, 0.3, -0.05), new THREE.Vector3(0.38, 1.4, -0.12)],
        [new THREE.Vector3(0.32, 0.3, -0.05), new THREE.Vector3(0.12, 1.45, -0.02)],
        [new THREE.Vector3(0.32, 0.3, -0.05), new THREE.Vector3(-0.1, 1.4, -0.18)],
      ];

      chordaePoints.forEach(([p1, p2]) => {
        const lineCurve = new THREE.LineCurve3(p1, p2);
        const cordMesh = new THREE.Mesh(
          new THREE.TubeGeometry(lineCurve, 8, 0.032, 6, false),
          chordaeMaterial
        );
        cavityGroup.add(cordMesh);
      });

      // F. Mitral Valve Inflow Annulus & Leaflets
      const valveMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xf1f5f9,
        roughness: 0.2,
        metalness: 0.05,
        clearcoat: 0.5,
        transparent: true,
        opacity: 0.88,
      });
      const valveRingGeo = new THREE.TorusGeometry(0.72, 0.07, 14, 28);
      const valveRingMesh = new THREE.Mesh(valveRingGeo, valveMaterial);
      valveRingMesh.position.set(0, 1.42, -0.1);
      valveRingMesh.rotation.x = THREE.MathUtils.degToRad(85);
      cavityGroup.add(valveRingMesh);
    }

    // --- ATRIA & AURICLES (Superior Posterior Chambers) ---
    // Right Atrium
    const raGeo = new THREE.SphereGeometry(1.35, 24, 24);
    raGeo.scale(0.95, 1.05, 0.9);
    const raMesh = new THREE.Mesh(raGeo, muscleMaterial);
    raMesh.position.set(-1.4, 2.3, -0.3);
    heartGroup.add(raMesh);

    // Left Atrium
    const laGeo = new THREE.SphereGeometry(1.25, 24, 24);
    laGeo.scale(0.9, 1.0, 0.9);
    const laMesh = new THREE.Mesh(laGeo, muscleMaterial);
    laMesh.position.set(1.1, 2.4, -0.6);
    heartGroup.add(laMesh);

    // --- ASCENDING AORTA & AORTIC ARCH ---
    const aortaCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.3, 1.8, 0.1),
      new THREE.Vector3(0.2, 3.2, 0.0),
      new THREE.Vector3(0.0, 4.3, -0.2),
      new THREE.Vector3(-0.9, 4.6, -0.7),
      new THREE.Vector3(-1.4, 3.9, -1.2),
      new THREE.Vector3(-1.5, 2.3, -1.5),
    ]);
    const aortaGeo = new THREE.TubeGeometry(aortaCurve, 32, 0.65, 20, false);
    const aortaMesh = new THREE.Mesh(aortaGeo, aortaMaterial);
    heartGroup.add(aortaMesh);
    aortaRef.current = aortaMesh;

    // 3 Aortic Branch Vessels (Brachiocephalic, Left Common Carotid, Left Subclavian)
    const branchPositions = [
      new THREE.Vector3(0.2, 4.4, -0.15),
      new THREE.Vector3(-0.25, 4.6, -0.4),
      new THREE.Vector3(-0.75, 4.55, -0.7),
    ];
    branchPositions.forEach((pos) => {
      const branchGeo = new THREE.CylinderGeometry(0.16, 0.19, 0.9, 14);
      const branchMesh = new THREE.Mesh(branchGeo, aortaMaterial);
      branchMesh.position.copy(pos);
      branchMesh.rotation.z = THREE.MathUtils.degToRad(-12);
      heartGroup.add(branchMesh);
    });

    // --- PULMONARY TRUNK & BIFURCATION ---
    const pulmonaryCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.6, 1.8, 0.7),
      new THREE.Vector3(-0.5, 2.9, 0.5),
      new THREE.Vector3(-0.2, 3.7, 0.1),
    ]);
    const pulmonaryGeo = new THREE.TubeGeometry(pulmonaryCurve, 20, 0.58, 18, false);
    const pulmonaryMesh = new THREE.Mesh(pulmonaryGeo, pulmonaryMaterial);
    heartGroup.add(pulmonaryMesh);

    // Left and Right Pulmonary Artery Branches
    const rpaGeo = new THREE.CylinderGeometry(0.32, 0.36, 1.6, 16);
    const rpaMesh = new THREE.Mesh(rpaGeo, pulmonaryMaterial);
    rpaMesh.position.set(-1.1, 3.7, -0.2);
    rpaMesh.rotation.z = THREE.MathUtils.degToRad(75);
    heartGroup.add(rpaMesh);

    const lpaGeo = new THREE.CylinderGeometry(0.3, 0.34, 1.4, 16);
    const lpaMesh = new THREE.Mesh(lpaGeo, pulmonaryMaterial);
    lpaMesh.position.set(0.6, 3.6, -0.2);
    lpaMesh.rotation.z = THREE.MathUtils.degToRad(-70);
    heartGroup.add(lpaMesh);

    // --- SUPERIOR VENA CAVA (SVC) ---
    const svcGeo = new THREE.CylinderGeometry(0.48, 0.52, 2.3, 18);
    const svcMesh = new THREE.Mesh(svcGeo, venaCavaMaterial);
    svcMesh.position.set(-1.6, 3.4, -0.6);
    heartGroup.add(svcMesh);

    // --- CORONARY ARTERY NETWORK (LAD & RCA) ---
    // Left Anterior Descending (LAD) traversing the anterior interventricular sulcus
    const ladCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.1, 2.0, 0.8),
      new THREE.Vector3(-0.15, 1.2, 0.95),
      new THREE.Vector3(-0.1, 0.2, 0.95),
      new THREE.Vector3(0.0, -0.9, 0.85),
      new THREE.Vector3(0.15, -1.8, 0.55),
      new THREE.Vector3(0.2, -2.6, 0.1),
    ]);
    const ladGeo = new THREE.TubeGeometry(ladCurve, 24, 0.08, 10, false);
    const ladMesh = new THREE.Mesh(ladGeo, coronaryArteryMaterial);
    heartGroup.add(ladMesh);

    // Diagonal branch 1
    const diag1Curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.15, 0.9, 0.95),
      new THREE.Vector3(0.6, 0.4, 0.8),
      new THREE.Vector3(1.1, -0.2, 0.5),
    ]);
    const diag1Mesh = new THREE.Mesh(
      new THREE.TubeGeometry(diag1Curve, 14, 0.05, 8, false),
      coronaryArteryMaterial
    );
    heartGroup.add(diag1Mesh);

    // 7. Interactive Orbit Controls via Mouse Drag
    const onMouseDown = (e) => {
      isDraggingRef.current = true;
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e) => {
      if (!isDraggingRef.current || !heartGroupRef.current) return;
      const deltaX = e.clientX - mousePosRef.current.x;
      const deltaY = e.clientY - mousePosRef.current.y;

      heartGroupRef.current.rotation.y += deltaX * 0.01;
      heartGroupRef.current.rotation.x += deltaY * 0.01;

      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
    };

    const onWheel = (e) => {
      if (!cameraRef.current) return;
      cameraRef.current.position.z = THREE.MathUtils.clamp(
        cameraRef.current.position.z + e.deltaY * 0.015,
        8,
        26
      );
    };

    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    container.addEventListener("wheel", onWheel, { passive: true });

    // Touch support for mobile/tablet
    const onTouchStart = (e) => {
      if (e.touches.length === 1) {
        isDraggingRef.current = true;
        mousePosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };
    const onTouchMove = (e) => {
      if (!isDraggingRef.current || !heartGroupRef.current || e.touches.length !== 1) return;
      const deltaX = e.touches[0].clientX - mousePosRef.current.x;
      const deltaY = e.touches[0].clientY - mousePosRef.current.y;
      heartGroupRef.current.rotation.y += deltaX * 0.01;
      heartGroupRef.current.rotation.x += deltaY * 0.01;
      mousePosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onTouchEnd = () => {
      isDraggingRef.current = false;
    };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);

    // 8. Biophysically-Synchronized Contraction Animation Loop
    let animId;
    let startTime = performance.now();

    const animate = (now) => {
      animId = requestAnimationFrame(animate);

      const cycleMs = (60 / Math.max(35, hr)) * 1000;
      const elapsed = (now - startTime) % cycleMs;
      const phase = elapsed / cycleMs; // 0.0 to 1.0

      // Wiggers cardiac cycle:
      // ~0.0 to 0.35: Ventricular systole (contraction & apex-base torsion)
      // ~0.35 to 1.0: Ventricular diastole (relaxation & filling)
      let contraction = 0;
      if (phase < 0.35) {
        contraction = Math.sin((phase / 0.35) * Math.PI) * efFrac;
      } else {
        contraction = Math.max(0, Math.sin(Math.PI) * Math.exp(-(phase - 0.35) * 4.5));
      }

      // Keep world clipping plane locked to heart rotation when cutaway is enabled
      if (crossSection && ventriclesRef.current) {
        worldCutPlane.copy(localCutPlane).applyMatrix4(ventriclesRef.current.matrixWorld);
      }

      // Ventricular volumetric displacement
      if (ventriclesRef.current) {
        const scaleX = 1.0 - contraction * 0.18;
        const scaleY = 1.0 - contraction * 0.12;
        const scaleZ = 1.0 - contraction * 0.18;
        ventriclesRef.current.scale.set(scaleX, scaleY, scaleZ);

        // Apex physiological torsion twist during peak systole
        ventriclesRef.current.rotation.y = contraction * 0.12;
      }

      // Windkessel Aortic root pulsatile radial dilation
      if (aortaRef.current) {
        const aorticPulse = phase < 0.45 ? Math.sin((phase / 0.45) * Math.PI) : 0;
        const aorticDilation = 1.0 + aorticPulse * 0.08 * (map / 90);
        aortaRef.current.scale.set(aorticDilation, 1.0, aorticDilation);
      }

      // Subtle resting idle orbit when not dragging
      if (!isDraggingRef.current && heartGroupRef.current) {
        heartGroupRef.current.rotation.y += 0.0018;
      }

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    // Resize handler
    const onResize = () => {
      if (!container || !camera || !renderer) return;
      const newW = container.clientWidth || 640;
      const newH = container.clientHeight || 420;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      renderer.dispose();
    };
  }, [hr, efFrac, crossSection, map]);

  // Set camera angle preset
  const applyPresetView = (preset) => {
    setActivePreset(preset);
    if (!heartGroupRef.current) return;
    if (preset === "anterior") {
      heartGroupRef.current.rotation.set(0, THREE.MathUtils.degToRad(-15), THREE.MathUtils.degToRad(-12));
    } else if (preset === "lateral") {
      heartGroupRef.current.rotation.set(0, THREE.MathUtils.degToRad(75), THREE.MathUtils.degToRad(-10));
    } else if (preset === "superior") {
      heartGroupRef.current.rotation.set(THREE.MathUtils.degToRad(55), 0, 0);
    } else if (preset === "posterior") {
      heartGroupRef.current.rotation.set(0, THREE.MathUtils.degToRad(165), THREE.MathUtils.degToRad(-10));
    }
  };

  // Toggle LV cavity cutaway and orient to optimal viewing angle
  const handleToggleCutaway = () => {
    const nextState = !crossSection;
    setCrossSection(nextState);
    if (nextState && heartGroupRef.current) {
      // Angle slightly to reveal interior chamber lumen directly
      heartGroupRef.current.rotation.set(
        THREE.MathUtils.degToRad(4),
        THREE.MathUtils.degToRad(-10),
        THREE.MathUtils.degToRad(-8)
      );
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4 w-full">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-gray-100 pb-3 gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <span>Realistic 3D Cardiac Digital Twin</span>
            <span className="text-xs bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded font-medium">
              WebGL PBR Simulation
            </span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Photorealistic cardiac anatomy &bull; Contraction rate {hr} bpm &bull; Stroke volume {sv} mL ({ef}% EF)
          </p>
        </div>

        {/* Viewport Presets & Dissection Mode */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-md">
            {[
              { id: "anterior", label: "Frontal" },
              { id: "lateral", label: "Left Ventricle" },
              { id: "superior", label: "Aorta & Great Vessels" },
              { id: "posterior", label: "Posterior Inflow" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPresetView(p.id)}
                className={`px-2.5 py-1 rounded text-xs transition font-medium ${
                  activePreset === p.id
                    ? "bg-white text-gray-900 shadow-sm font-semibold"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowLabels(!showLabels)}
            className={`px-2.5 py-1.5 rounded border transition font-medium ${
              showLabels
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
            }`}
          >
            {showLabels ? "Hide Callouts" : "Show Callouts"}
          </button>

          <button
            type="button"
            onClick={handleToggleCutaway}
            className={`px-3 py-1.5 rounded border transition font-semibold flex items-center gap-1.5 shadow-sm ${
              crossSection
                ? "bg-rose-700 text-white border-rose-700 ring-2 ring-rose-200"
                : "bg-teal-50 text-teal-800 border-teal-300 hover:bg-teal-100"
            }`}
          >
            <span>{crossSection ? "Exterior Anatomy" : "LV Cavity Cutaway"}</span>
          </button>
        </div>
      </div>

      {/* 3D WebGL Canvas Container + Side Telemetry Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* WebGL Canvas Viewport */}
        <div className="lg:col-span-8 bg-slate-50/70 border border-gray-200 rounded-lg relative overflow-hidden select-none cursor-grab active:cursor-grabbing min-h-[420px] flex items-center justify-center">
          <div ref={mountRef} className="w-full h-[420px]" />

          {/* User interaction hint */}
          <div className="absolute bottom-3 left-3 text-[11px] text-gray-500 bg-white/85 px-2.5 py-1 rounded border border-gray-200 backdrop-blur-sm pointer-events-none font-medium flex items-center gap-1.5 shadow-sm">
            <span>Click &amp; drag to rotate 360&deg; &bull; Scroll to zoom</span>
          </div>

          {/* Exterior Anatomical Callouts */}
          {showLabels && !crossSection && (
            <div className="absolute top-3 left-3 space-y-1.5 pointer-events-none">
              <span className="text-[11px] bg-white/90 text-red-950 font-semibold px-2 py-0.5 rounded border border-red-200 backdrop-blur-sm block shadow-sm">
                &bull; Aorta &amp; Arch Branches
              </span>
              <span className="text-[11px] bg-white/90 text-sky-950 font-semibold px-2 py-0.5 rounded border border-sky-200 backdrop-blur-sm block shadow-sm">
                &bull; Pulmonary Trunk &amp; Arteries
              </span>
              <span className="text-[11px] bg-white/90 text-rose-950 font-semibold px-2 py-0.5 rounded border border-rose-200 backdrop-blur-sm block shadow-sm">
                &bull; Left Anterior Descending (LAD) Artery
              </span>
              <span className="text-[11px] bg-white/90 text-gray-900 font-semibold px-2 py-0.5 rounded border border-gray-200 backdrop-blur-sm block shadow-sm">
                &bull; Left &amp; Right Ventricles
              </span>
            </div>
          )}

          {/* Dissection Cutaway Internal Anatomical Callouts */}
          {showLabels && crossSection && (
            <div className="absolute top-3 left-3 space-y-1.5 pointer-events-none">
              <span className="text-[11px] bg-white/95 text-rose-950 font-semibold px-2 py-0.5 rounded border border-rose-300 backdrop-blur-sm block shadow-sm">
                &bull; LV Myocardial Wall Cross-Section (12 mm)
              </span>
              <span className="text-[11px] bg-white/95 text-red-950 font-semibold px-2 py-0.5 rounded border border-red-300 backdrop-blur-sm block shadow-sm">
                &bull; Internal Left Ventricular Lumen
              </span>
              <span className="text-[11px] bg-white/95 text-amber-950 font-semibold px-2 py-0.5 rounded border border-amber-300 backdrop-blur-sm block shadow-sm">
                &bull; Papillary Muscles &amp; Chordae Tendineae
              </span>
              <span className="text-[11px] bg-white/95 text-slate-900 font-semibold px-2 py-0.5 rounded border border-slate-300 backdrop-blur-sm block shadow-sm">
                &bull; Interventricular Septum (IVS)
              </span>
            </div>
          )}

          {/* Live Dynamic Cycle Status */}
          <div className="absolute top-3 right-3 text-[11px] text-teal-800 bg-teal-50/90 px-2.5 py-1 rounded border border-teal-200 backdrop-blur-sm font-medium tabular-nums shadow-sm">
            Pulsing at {hr} bpm &bull; {co} L/min CO
          </div>
        </div>

        {/* Telemetry Mapping Card */}
        <div className="lg:col-span-4 space-y-3.5">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2.5">
            <span className="text-xs font-semibold text-gray-700 block border-b border-gray-200 pb-1.5">
              Hemodynamic Volumetric Telemetry
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-500 block">End-Diastolic (EDV)</span>
                <span className="font-semibold text-gray-800 text-sm tabular-nums">{edv} mL</span>
              </div>
              <div>
                <span className="text-gray-500 block">End-Systolic (ESV)</span>
                <span className="font-semibold text-gray-800 text-sm tabular-nums">{esv} mL</span>
              </div>
              <div>
                <span className="text-gray-500 block">Stroke Volume (SV)</span>
                <span className="font-semibold text-teal-800 text-sm tabular-nums">{sv} mL/beat</span>
              </div>
              <div>
                <span className="text-gray-500 block">Cardiac Output (CO)</span>
                <span className="font-semibold text-teal-800 text-sm tabular-nums">{co} L/min</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2 text-xs">
            <span className="font-semibold text-gray-800 block">
              {crossSection ? "LV Cavity Cutaway Anatomy:" : "0D Windkessel Coupling:"}
            </span>
            <p className="text-gray-600 leading-relaxed text-[11px]">
              {crossSection
                ? `Coronal dissection exposes the internal left ventricular lumen (EDV ${edv} mL → ESV ${esv} mL). Notice the thick 12 mm muscular myocardium wall, dual anterolateral and posteromedial papillary muscle columns, and white fibrous chordae tendineae anchored to the mitral valve ring.`
                : `The 3D cardiac digital twin maps its pumping frequency directly to simulated heart rate (T = ${(60 / Math.max(35, hr)).toFixed(2)}s). Left ventricular inward deflection corresponds to ${ef}% Ejection Fraction, and radial expansion of the aortic root simulates Windkessel compliance under ${map} mmHg Mean Arterial Pressure.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
