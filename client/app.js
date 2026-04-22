document.addEventListener('DOMContentLoaded', () => {
  const navItems = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.view');

  // Tab switching logic
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Remove active class from all items
      navItems.forEach(nav => nav.classList.remove('active'));
      views.forEach(view => view.classList.remove('active'));
      
      // Add active class to clicked item
      item.classList.add('active');
      
      // Show corresponding view
      const targetId = `view-${item.dataset.target}`;
      const targetView = document.getElementById(targetId);
      if (targetView) {
        targetView.classList.add('active');
      } else {
        // Fallback for not implemented views
        console.warn(`View ${targetId} not found. Showing a placeholder.`);
        // You could dynamically create a placeholder here if needed
      }
    });
  });

  // Example of interactive quick actions
  const buttons = document.querySelectorAll('.quick-actions .btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const icon = btn.querySelector('i');
      if (icon && icon.classList.contains('ph-arrows-clockwise')) {
        // Spin animation on restart
        icon.style.transition = "transform 0.5s ease";
        icon.style.transform = "rotate(360deg)";
        setTimeout(() => {
          icon.style.transition = "none";
          icon.style.transform = "rotate(0deg)";
        }, 500);
      }
    });
  });
});
