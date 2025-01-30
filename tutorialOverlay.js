// tutorialOverlay.js
export default class TutorialOverlay {
    constructor() {
        this.isShown = false;
        this.overlay = null;
        this.initialNavigationComplete = false;
        this.canShowTutorial = false;
        // Manteniamo il sessionStorage per il tutorial solo su network.html
        window.addEventListener('beforeunload', (event) => {
            // Se stiamo navigando verso landing.html, pulisci il sessionStorage
            if (document.referrer.includes('landing.html')) {
                sessionStorage.removeItem('tutorialShown');
            }
        });
        this.hasBeenShownBefore = sessionStorage.getItem('tutorialShown') === 'true';
        this.setupEventListeners();
        this.initializeTimer();
    }

    initializeTimer() {
        setTimeout(() => {
            this.canShowTutorial = true;
        }, 2000);
    }

    setupEventListeners() {
        document.addEventListener('DOMContentLoaded', () => {
            const initialView = sessionStorage.getItem('initialView');
            if (initialView) {
                this.initialNavigationComplete = true;
            }
        });

        const events = [
            'click',      
            'wheel',      
            'mousedown',  
            'touchstart', 
            'touchmove',  
            'dragstart',  
            'drag'        
        ];

        // Gestione eventi per l'apertura del tutorial
        const handleEvent = (e) => {
            if (!this.canShowTutorial || !this.initialNavigationComplete || this.isShown || this.hasBeenShownBefore) {
                return;
            }

            if (e.target.closest('.landing-box') || e.target.closest('.tutorial-overlay')) {
                return;
            }

            const isLandingElement = e.target.closest('.landing-container');
            if (!isLandingElement) {
                // Previeni l'azione predefinita per i controlli
                if (e.target.closest('#filters') || 
                    e.target.closest('#view-mode-button') || 
                    e.target.closest('#legend-button')) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                
                // Per gli altri eventi, previeni solo se non sono touch
                else if (!e.type.startsWith('touch')) {
                    e.preventDefault();
                }
                e.stopPropagation();
                this.show();
            }
        };

        // Usa once: true per assicurarti che l'evento venga gestito una sola volta
        events.forEach(event => {
            document.addEventListener(event, handleEvent, { capture: true, once: true });
        });

        window.addEventListener('load', () => {
            setTimeout(() => {
                this.initialNavigationComplete = true;
            }, 1000);
        });
    }

    closeOverlay() {
        if (this.overlay) {
            this.overlay
                .style("opacity", "0")
                .on("transitionend", () => {
                    this.overlay.remove();
                    document.querySelector('#dataset-button').style.display = '';
                    this.isShown = false;
                    // Usa sessionStorage invece di localStorage
                    sessionStorage.setItem('tutorialShown', 'true');
                    this.hasBeenShownBefore = true;
                });
        }
    }

    createOverlay(viewType = 'network') {
        const overlay = d3.select("body")
            .append("div")
            .attr("class", "tutorial-overlay")
            .style("position", "fixed")
            .style("top", "0")
            .style("left", "0")
            .style("width", "100%")
            .style("height", "100%")
            .style("background-color", "rgba(236, 236, 236, 0.95)")
            .style("z-index", "5")
            .style("display", "flex")
            .style("flex-direction", "column")
            .style("justify-content", "center")
            .style("align-items", "center")
            .style("opacity", "0")
            .style("transition", "opacity 0.3s ease-in-out");

        // Imposta z-index più alto per i controlli che devono rimanere visibili
        ['#filters', '#view-mode-button', '#legend-button'].forEach(selector => {
            const element = document.querySelector(selector);
            if (element) element.style.zIndex = "1000";
        });

        // Nascondi solo il dataset button
        document.querySelector('#dataset-button').style.display = 'none';
        
        const closeButton = overlay
            .append("button")
            .attr("class", "tutorial-close")
            .style("position", "absolute")
            .style("top", "20px")
            .style("right", "20px")
            .style("background", "none")
            .style("border", "none")
            .style("font-size", "24px")
            .style("cursor", "pointer")
            .text("×");

        const content = overlay
            .append("div")
            .style("text-align", "left")
            .style("max-width", "600px")
            .style("padding", "0 20px");

        if (viewType === 'gallery') {
            content.append("h2")
                .attr("class", "font-size-medium")
                .style("text-align", "left")
                .text("Welcome to the Gallery View");

            content.append("p")
                .attr("class", "font-size-regular")
                .style("margin", "20px 0")
                .text("This is a gallery showing the visual connections between different projects and actors:");

            const instructions = [
                "Hover over images to see connections between projects. Explore the map by moving and zooming and use the filters above to focus on specific categories. You can always change the visualisation or open the legend for any doubts.",
            ];

            content.selectAll(".instruction")
                .data(instructions)
                .enter()
                .append("p")
                .attr("class", "font-size-regular")
                .style("margin", "10px 0")
                .text(d => d);
        } else {
            content.append("h2")
                .attr("class", "font-size-medium")
                .style("text-align", "left")
                .text("Welcome to the Network Visualization");

            content.append("p")
                .attr("class", "font-size-regular")
                .style("margin", "20px 0")
                .text("This is a network map showing different actors and their connections:");

            const instructions = [
                "Click on nodes to get detailed information. Explore the map by moving and zooming and use the filters above to show different types of connections. You can always change the visualisation or open the legend for any doubts.",
            ];

            content.selectAll(".instruction")
                .data(instructions)
                .enter()
                .append("p")
                .attr("class", "font-size-regular")
                .style("margin", "10px 0")
                .text(d => d);
        }

        /* content.append("p")
            .attr("class", "font-size-regular")
            .style("margin-top", "30px")
            .style("text-align", "center")
            .text("Click anywhere or the × button to start exploring"); */

        return overlay;
    }

    show(viewType = 'network') {
        if (this.isShown || !this.canShowTutorial || this.hasBeenShownBefore) return;

        const currentViewType = document.querySelector('[data-mode="gallery"].active') ? 'gallery' : 'network';
        this.isShown = true;
        this.overlay = this.createOverlay(currentViewType);

        // Click sull'overlay chiude il tutorial
        this.overlay.on("click", () => this.closeOverlay());
        
        // Click sul pulsante di chiusura
        this.overlay.select(".tutorial-close").on("click", (e) => {
            e.stopPropagation();
            this.closeOverlay();
        });

        // Aggiungi i listener per la chiusura sui controlli dopo un delay
        setTimeout(() => {
            const controls = document.querySelectorAll('#filters button, #filters label, #filters input, #view-mode-button button, #legend-button label');
            controls.forEach(control => {
                control.addEventListener('click', () => this.closeOverlay());
            });
        }, 1000);

        // Mostra il tutorial con fade
        setTimeout(() => {
            this.overlay.style("opacity", "1");
        }, 0);
    }
}