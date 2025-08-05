document.addEventListener("DOMContentLoaded", () => {
  const features = document.querySelectorAll(".feature");

  features.forEach((feature) => {
    // Highlight feature on click
    feature.addEventListener("click", () => {
      // Remove active class from all features
      features.forEach((f) => f.classList.remove("active"));

      // Add active class to the clicked feature
      feature.classList.add("active");
    });
  });
});
