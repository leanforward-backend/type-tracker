import { useEffect, useRef } from "react";

const ParticleBackground = ({ onClick, isLoading }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const loadingRef = useRef(isLoading);

  useEffect(() => {
    loadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let animationFrameId;
    let particles = [];
    let mouse = { x: null, y: null };
    let gravityEnabled = true;

    const resizeCanvas = () => {
      if (containerRef.current) {
        canvas.width = containerRef.current.offsetWidth;
        canvas.height = containerRef.current.offsetHeight;
        initParticles();
      }
    };

    class Particle {
      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2 + 1;
        this.speedX = Math.random() * 0.2 - 0.1;
        this.speedY = Math.random() * 0.2 - 0.1;
        const colors = ["#00f2ff", "#0077ffff", "#48daffff"];
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.baseX = this.x;
        this.baseY = this.y;
        this.density = Math.random() * 30 + 1;
      }

      update() {
        const speedMultiplier = mouse.x != null ? 1.8 : 1;

        if (loadingRef.current) {
          this.speedY += 0.05;
        } else if (Math.abs(this.speedY) > 0.2) {
          this.speedY *= 0.95;
        }

        this.x += this.speedX * speedMultiplier;
        this.y += this.speedY * speedMultiplier;

        if (this.x > canvas.width || this.x < 0) this.speedX = -this.speedX;
        if (this.y > canvas.height || this.y < 0) this.speedY = -this.speedY;

        if (mouse.x != null) {
          let dx = mouse.x - this.x;
          let dy = mouse.y - this.y;
          let distance = Math.sqrt(dx * dx + dy * dy);
          let forceDirectionX = dx / distance;
          let forceDirectionY = dy / distance;
          let maxDistance = 35;
          let force = (maxDistance - distance) / maxDistance;
          let directionX = forceDirectionX * force * this.density;
          let directionY = forceDirectionY * force * this.density;

          if (distance < maxDistance) {
            this.x -= directionX;
            this.y -= directionY;
          }
        }
      }

      draw() {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = this.color;
        ctx.beginPath();

        const sizeMultiplier = mouse.x != null ? 1.2 : 1;
        ctx.arc(this.x, this.y, this.size * sizeMultiplier, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }
    }

    const initParticles = () => {
      particles = [];
      const numberOfParticles = (canvas.width * canvas.height) / 900;
      for (let i = 0; i < numberOfParticles; i++) {
        particles.push(new Particle());
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();
      }
      animationFrameId = requestAnimationFrame(animate);
    };

    window.addEventListener("resize", resizeCanvas);
    // Initial resize after a small delay to ensure container has size
    setTimeout(resizeCanvas, 100);
    animate();

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      console.log("mouse enter");
    };

    const handleMouseLeave = () => {
      mouse.x = null;
      mouse.y = null;
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationFrameId);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      onClick={!isLoading ? onClick : undefined}
      className={`relative w-full h-40 rounded-lg overflow-hidden border border-white/10 hover:border-[var(--accent-primary)] transition-all duration-500 group ${!isLoading ? "cursor-pointer" : "cursor-default"}`}
      style={{
        background: "linear-gradient(to bottom right, #0a0a0a, #161616)",
      }}
    >
      <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center group-hover:border-[var(--accent-primary)] group-hover:scale-105 transition-all duration-300 shadow-xl">
          <h3 className="text-lg font-bold text-white mb-3 group-hover:text-[var(--accent-primary)] transition-colors drop-shadow-lg">
            {isLoading ? "Generating..." : "Generate AI Analysis"}
          </h3>
        </div>
      </div>
    </div>
  );
};

export default ParticleBackground;
