window.HELP_IMPROVE_VIDEOJS = false;

var INTERP_BASE = "./static/interpolation/stacked";
var NUM_INTERP_FRAMES = 240;

var interp_images = [];
function preloadInterpolationImages() {
  for (var i = 0; i < NUM_INTERP_FRAMES; i++) {
    var path = INTERP_BASE + '/' + String(i).padStart(6, '0') + '.jpg';
    interp_images[i] = new Image();
    interp_images[i].src = path;
  }
}

function setInterpolationImage(i) {
  var image = interp_images[i];
  image.ondragstart = function() { return false; };
  image.oncontextmenu = function() { return false; };
  $('#interpolation-image-wrapper').empty().append(image);
}


// point cloud render
// 点云渲染相关变量和函数
var pointCloudScenes = {};
var pointCloudRenderers = {};
var pointCloudCameras = {};
var pointCloudControls = {};

// 初始化点云渲染器
function initPointCloudRenderer(containerId) {
  if (!document.getElementById(containerId)) return;
  
  const container = document.getElementById(containerId);
  
  // 创建场景
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);
  
  // 创建相机
  const camera = new THREE.PerspectiveCamera(
    75, 
    container.clientWidth / container.clientHeight, 
    0.1, 
    1000
  );
  camera.position.set(0, 0, 5);
  
  // 创建渲染器
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);
  
  // 添加轨道控制
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.25;
  
  // 添加光源
  const ambientLight = new THREE.AmbientLight(0x606060);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(1, 1, 1);
  scene.add(directionalLight);
  
  // 存储场景、渲染器、相机和控制器引用
  pointCloudScenes[containerId] = scene;
  pointCloudRenderers[containerId] = renderer;
  pointCloudCameras[containerId] = camera;
  pointCloudControls[containerId] = controls;
  
  // 渲染循环
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
  
  // 窗口大小变化时调整
  function onResize() {
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
  
  window.addEventListener('resize', onResize);
  
  return {
    scene: scene,
    camera: camera,
    renderer: renderer,
    controls: controls
  };
}

// 加载PLY点云文件
function loadPLYPointCloud(containerId, plyFilePath) {
  if (!pointCloudScenes[containerId]) {
    console.error("点云容器未初始化:", containerId);
    return;
  }
  
  const scene = pointCloudScenes[containerId];
  
  // 清除场景中可能存在的旧点云
  scene.children.forEach(child => {
    if (child instanceof THREE.Points) {
      scene.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
  });
  
  // 创建PLY加载器
  const loader = new THREE.PLYLoader();
  
  // 加载PLY文件
  loader.load(
    plyFilePath,
    function(geometry) {
      // 处理几何体，添加顶点颜色属性
      if (!geometry.hasAttribute('color')) {
        // 如果PLY文件没有颜色信息，则使用基于位置的颜色
        const positions = geometry.getAttribute('position');
        const colors = new Float32Array(positions.count * 3);
        
        for (let i = 0; i < positions.count; i++) {
          // 归一化坐标到[0,1]范围
          const x = (positions.getX(i) / 5) + 0.5;
          const y = (positions.getY(i) / 5) + 0.5;
          const z = (positions.getZ(i) / 5) + 0.5;
          
          // 使用坐标作为RGB颜色
          colors[i * 3] = x;
          colors[i * 3 + 1] = y;
          colors[i * 3 + 2] = z;
        }
        
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }
      
      // 创建点云材质
      const material = new THREE.PointsMaterial({
        size: 0.02,
        vertexColors: true
      });
      
      // 创建点云对象
      const pointCloud = new THREE.Points(geometry, material);
      
      // 调整点云位置，使其居中
      geometry.computeBoundingBox();
      const center = new THREE.Vector3();
      geometry.boundingBox.getCenter(center);
      pointCloud.position.set(-center.x, -center.y, -center.z);
      
      // 添加到场景
      scene.add(pointCloud);
      
      // 自动调整相机位置以适应点云
      const camera = pointCloudCameras[containerId];
      const controls = pointCloudControls[containerId];
      
      if (camera && controls) {
        const box = new THREE.Box3().setFromObject(pointCloud);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        const cameraDistance = maxDim / (2 * Math.tan(fov / 2));
        
        camera.position.set(0, 0, cameraDistance * 1.5);
        camera.lookAt(new THREE.Vector3(0, 0, 0));
        controls.target.set(0, 0, 0);
        controls.update();
      }
    },
    function(xhr) {
      // 加载进度
      console.log((xhr.loaded / xhr.total * 100) + '% 已加载');
    },
    function(error) {
      // 加载错误
      console.error('加载PLY文件出错:', error);
    }
  );
}

// 初始化所有点云容器
function initAllPointClouds() {
  // 查找页面中所有点云容器
  const containers = document.querySelectorAll('.pointcloud-container');
  
  containers.forEach(container => {
    const id = container.id;
    const plyPath = container.getAttribute('data-ply-path');
    
    if (id && plyPath) {
      // 初始化渲染器
      initPointCloudRenderer(id);
      // 加载点云
      loadPLYPointCloud(id, plyPath);
    }
  });
}


$(document).ready(function() {
    // Check for click events on the navbar burger icon
    $(".navbar-burger").click(function() {
      // Toggle the "is-active" class on both the "navbar-burger" and the "navbar-menu"
      $(".navbar-burger").toggleClass("is-active");
      $(".navbar-menu").toggleClass("is-active");

    });

    var options = {
			slidesToScroll: 1,
			slidesToShow: 1,
			loop: true,
			infinite: true,
			autoplay: false,
			autoplaySpeed: 3000,
    }

		// Initialize all div with carousel class
    var carousels = bulmaCarousel.attach('.carousel', options);

    // Loop on each carousel initialized
    for(var i = 0; i < carousels.length; i++) {
    	// Add listener to  event
    	carousels[i].on('before:show', state => {
    		console.log(state);
    	});
    }

    // Access to bulmaCarousel instance of an element
    var element = document.querySelector('#my-element');
    if (element && element.bulmaCarousel) {
    	// bulmaCarousel instance is available as element.bulmaCarousel
    	element.bulmaCarousel.on('before-show', function(state) {
    		console.log(state);
    	});
    }

    /*var player = document.getElementById('interpolation-video');
    player.addEventListener('loadedmetadata', function() {
      $('#interpolation-slider').on('input', function(event) {
        console.log(this.value, player.duration);
        player.currentTime = player.duration / 100 * this.value;
      })
    }, false);*/
    preloadInterpolationImages();

    $('#interpolation-slider').on('input', function(event) {
      setInterpolationImage(this.value);
    });
    setInterpolationImage(0);
    $('#interpolation-slider').prop('max', NUM_INTERP_FRAMES - 1);

    // 初始化点云
    setTimeout(initAllPointClouds, 500); // 延迟加载，确保DOM已完全渲染

    bulmaSlider.attach();

})
