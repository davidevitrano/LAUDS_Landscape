// Gallery visualization using D3
const imagesDataPath = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQp36mdL-RkcueBn5dK1W4lZDTSJy4n9sFmGqFExWs6bcAQT6JSVm_BVtSxxu4g-jIwTC1QhFj30dFY/pub?gid=0&single=true&output=csv";

class GalleryView {
    constructor(containerId) {
        this.container = d3.select(containerId);
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.svg = null;
        this.simulation = null;
        this.g = null;
        this.nodes = [];
        this.categories = ['Values', 'Materials', 'Processes and Technologies', 'Knowledge Sharing'];
        this.categorizedImages = {};
        this.isPopupOpen = false;
        this.activeNode = null;
        this.currentImageIndex = 0;
        this.animationInterval = null;
        this.loadedImages = new Set();
        this.initialPositions = {}; // Store initial positions of nodes
    }


    async initialize() {
        try {
            this.svg = this.container.append("svg")
                .attr("width", this.width)
                .attr("height", this.height)
                .style("background-color", "#ECECEC");
    
            this.g = this.svg.append("g");
    
            const zoom = d3.zoom()
                .scaleExtent([0.7, 5])
                .on("zoom", (event) => {
                    this.g.attr("transform", event.transform);
                    this.g.selectAll(".category-label, .node-text")
                        .attr("transform", `scale(${1 / event.transform.k})`);
                    this.g.selectAll("path")
                        .style("stroke-width", `${1.5 / event.transform.k}px`);
                });
    
            this.svg.call(zoom);
    
            d3.selectAll("#filters input").on("change", () => {
                this.updateVisibility();
            });
    
            await this.loadData();
            this.createSimulation();
            await this.preloadImages();
            this.render();
            this.updateVisibility();
            
            return Promise.resolve();
        } catch (error) {
            console.error("Error initializing gallery view:", error);
            return Promise.reject(error);
        }
    }

    async loadData() {
        try {
            const data = await d3.csv(imagesDataPath);
            
            this.categories.forEach(category => {
                this.categorizedImages[category] = new Map();
                
                data.forEach(item => {
                    if (item[category]) {
                        const values = item[category].split(", ");
                        values.forEach(value => {
                            if (!this.categorizedImages[category].has(value)) {
                                this.categorizedImages[category].set(value, []);
                            }
                            if (item['Image Link'] && item['Image Link'].trim() !== '') {
                                this.categorizedImages[category].get(value).push({
                                    imageUrl: item['Image Link'],
                                    owner: item['Owner'],
                                    website: item['Website Link']
                                });
                            }
                        });
                    }
                });
            });

            this.nodes = [];
            this.categories.forEach(category => {
                this.categorizedImages[category].forEach((images, value) => {
                    if (images.length > 0) {
                        this.nodes.push({
                            id: value,
                            category: category,
                            images: images
                        });
                    }
                });
            });
        } catch (error) {
            console.error("Error loading gallery data:", error);
            throw error;
        }
    }

    async preloadImages() {
        const imagePromises = [];
        
        // Raccoglie tutti gli URL delle immagini
        Object.values(this.categorizedImages).forEach(category => {
            category.forEach(images => {
                images.forEach(img => {
                    if (!this.loadedImages.has(img.imageUrl)) {
                        const promise = new Promise((resolve, reject) => {
                            const image = new Image();
                            image.onload = () => {
                                this.loadedImages.add(img.imageUrl);
                                resolve();
                            };
                            image.onerror = reject;
                            image.src = img.imageUrl;
                        });
                        imagePromises.push(promise);
                    }
                });
            });
        });

        // Attende il caricamento di tutte le immagini
        try {
            await Promise.all(imagePromises);
        } catch (error) {
            console.error("Error preloading images:", error);
        }
    }

   async createImagePopup(imageData, category, elementName, event) {
       // Rimuove popup esistenti e pulisce intervalli di animazione
        if (this.animationInterval) {
            clearInterval(this.animationInterval);
            this.animationInterval = null;
        }
        d3.select("#popup").remove();

        // Trova le immagini correlate
        let relatedImages = await this.findRelatedImages(imageData.owner);
        
        // Filter out the current image
        relatedImages = relatedImages.filter(img => img.imageUrl !== imageData.imageUrl);
        
        // Crea il nuovo popup
        const newPopup = d3.select("body").append("div")
            .attr("id", "popup")
            .attr("class", "visible");

        const popupContent = `
            <button id="close-popup" class="popup-close">×</button>
            <div>${elementName}</div>
            <h3>${imageData.owner}</h3>
            <div class="popup-image-container" style="height: 35vh; overflow: hidden; border-radius: 0.625rem; margin: 1rem 0;">
                <img src="${imageData.imageUrl}" 
                     alt="${elementName}" 
                     style="width: 100%; 
                            height: 100%; 
                            object-fit: cover; 
                            object-position: center;">
            </div>
            <div>Images from the same source</div>
            <div class="correlated-images-container" style="height: 30vh; overflow: hidden; border-radius: 0.625rem; margin: 1rem 0; position: relative;">
                ${relatedImages.map((img, index) => `
                    <img src="${img.imageUrl}" 
                         alt="Correlated image ${index + 1}"
                         class="correlated-image"
                         style="position: absolute;
                                width: 100%;
                                height: 100%;
                                object-fit: cover;
                                opacity: 0;
                                transition: opacity 0.1s ease-in-out;">
                `).join('')}
            </div>`;

        newPopup.html(popupContent);

        // Gestisce il pulsante di chiusura
        d3.select("#close-popup").on("click", () => {
            if (this.animationInterval) {
                clearInterval(this.animationInterval);
                this.animationInterval = null;
            }
            newPopup.remove();
            this.isPopupOpen = false;
            this.activeNode = null;
            
            this.g.selectAll("image")
                .style("opacity", 1);
            
            this.g.selectAll("text.category-label")
                .style("opacity", 1);

            this.g.selectAll("path").remove();
        });

        // Avvia l'animazione delle immagini
        await this.startImageAnimation(relatedImages);

        this.isPopupOpen = true;
    }

    async findRelatedImages(owner) {
        let relatedImages = [];
        
        Object.values(this.categorizedImages).forEach(category => {
            category.forEach((images, _) => {
                images.forEach(img => {
                    if (img.owner === owner) {
                        relatedImages.push(img);
                    }
                });
            });
        });

        // Rimuove i duplicati basati su imageUrl
        relatedImages = Array.from(new Map(relatedImages.map(img => [img.imageUrl, img])).values());
        return relatedImages;
    }

    async startImageAnimation(relatedImages) {
        if (relatedImages.length <= 1) return;

        let currentIndex = 0;
        
        // Mostra la prima immagine immediatamente
        d3.select(".correlated-images-container")
            .select(`img:nth-child(1)`)
            .style("opacity", 1);

        // Imposta l'intervallo per il ciclo delle immagini
        this.animationInterval = setInterval(() => {
            // Nasconde l'immagine corrente
            d3.select(".correlated-images-container")
                .select(`img:nth-child(${currentIndex + 1})`)
                .style("opacity", 0);

            // Passa all'immagine successiva
            currentIndex = (currentIndex + 1) % relatedImages.length;

            // Mostra l'immagine successiva
            d3.select(".correlated-images-container")
                .select(`img:nth-child(${currentIndex + 1})`)
                .style("opacity", 1);
        }, 400);
    }

    createSimulation() {
        this.simulation = d3.forceSimulation(this.nodes)
            .force("center", d3.forceCenter(this.width / 2, this.height / 2))
            .force("charge", d3.forceManyBody().strength(-60))
            .force("collision", d3.forceCollide().radius(50))
            .on("tick", () => this.updateNodePositions());

        // Store initial positions after the first simulation run
        this.simulation.on("end", () => {
            this.nodes.forEach(node => {
                this.initialPositions[node.id] = { x: node.x, y: node.y };
            });
        });
    }

    updateNodePositions() {
        this.g.selectAll(".node-group")
            .attr("transform", d => `translate(${d.x},${d.y})`);
    }

    render() {
        this.g.selectAll("*").remove();
        const linesContainer = this.g.append("g")
            .attr("class", "lines-container");

        const nodeGroups = this.g.selectAll(".node-group")
            .data(this.nodes)
            .enter()
            .append("g")
            .attr("class", "node-group");

        nodeGroups.append("text")
            .attr("class", "category-label font-size-small")
            .attr("x", d => {
                const imageSize = 40;
                const padding = 2;
                const imagesPerRow = 4;
                return -(((imagesPerRow * (imageSize + padding)) / 2));
            })
            .attr("y", -15)
            .attr("text-anchor", "start")
            .text(d => d.id)
            .style("transition", "fill 0.3s ease");

        nodeGroups.each((d, i, nodes) => {
            const group = d3.select(nodes[i]);
            const imageSize = 40;
            const padding = 2;
            const imagesPerRow = 4;
            
            d.images.forEach((img, index) => {
                const row = Math.floor(index / imagesPerRow);
                const col = index % imagesPerRow;
                const x = (col * (imageSize + padding)) - ((imagesPerRow * (imageSize + padding)) / 2) + padding;
                const y = row * (imageSize + padding);
                
                const imageContainer = group.append("g")
                    .attr("class", "image-container")
                    .attr("transform", `translate(${x}, ${y})`)
                    .attr("data-owner", img.owner)
                    .attr("data-category", d.category);

                    imageContainer.append("image")
                    .attr("width", imageSize)
                    .attr("height", imageSize)
                    .attr("xlink:href", img.imageUrl)
                    .style("cursor", "pointer")
                    .style("transition", "opacity 0.3s ease")
                    .on("click", (event, d) => {
                        // Open website link on click
                        if (img.website && img.website.trim() !== "") {
                            window.open(img.website, "_blank");
                        }
                    })
                    .on("mouseenter", (event) => {
                        // Handle mouseenter...
                        event.stopPropagation();
                        this.createImagePopup(img, d.category, d.id, event);
                        
                        const currentOwner = img.owner;
                        
                        this.g.selectAll("image")
                            .style("opacity", 0.1);
                        
                        this.g.selectAll("text.category-label")
                            .style("opacity", 0.1);

                        linesContainer.selectAll("path").remove();

                        const relatedContainers = this.g.selectAll(".image-container")
                            .filter(function() {
                                const container = d3.select(this);
                                const nodeGroup = d3.select(this.parentNode);
                                return container.attr("data-owner") === currentOwner && 
                                       nodeGroup.style("display") !== "none";
                            });

                        relatedContainers.select("image")
                            .style("opacity", 1);

                        relatedContainers.each(function() {
                            const parentGroup = d3.select(this.parentNode);
                            parentGroup.selectAll("text.category-label")
                                .style("opacity", 1);
                        });

                         // Drawing connection lines...
                         const getTranslateValues = (transform) => {
                            if (!transform) return { x: 0, y: 0 };
                            const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
                            return match ? {
                                x: parseFloat(match[1]),
                                y: parseFloat(match[2])
                            } : { x: 0, y: 0 };
                        };

                        const sourceContainer = d3.select(event.target.parentNode);
                        const sourceTransform = sourceContainer.attr("transform");
                        const sourcePos = getTranslateValues(sourceTransform);
                        const parentTransform = d3.select(event.target.parentNode.parentNode).attr("transform");
                        const parentPos = getTranslateValues(parentTransform);
                        const sourceX = sourcePos.x + parentPos.x + imageSize/2;
                        const sourceY = sourcePos.y + parentPos.y + imageSize/2;

                        const currentTransform = d3.zoomTransform(this.svg.node());

                        relatedContainers.each(function() {
                            const targetContainer = d3.select(this);
                            if (targetContainer.node() !== sourceContainer.node()) {
                                const targetCategory = targetContainer.attr("data-category");
                                const targetTransform = targetContainer.attr("transform");
                                const targetPos = getTranslateValues(targetTransform);
                                const targetParentTransform = d3.select(this.parentNode).attr("transform");
                                const targetParentPos = getTranslateValues(targetParentTransform);
                                const targetX = targetPos.x + targetParentPos.x + imageSize/2;
                                const targetY = targetPos.y + targetParentPos.y + imageSize/2;

                                const dx = targetX - sourceX;
                                const dy = targetY - sourceY;
                                const dr = Math.sqrt(dx * dx + dy * dy);

                                let strokeColor;
                                switch(targetCategory) {
                                    case 'Values': strokeColor = "#FF5C00"; break;
                                    case 'Materials': strokeColor = "#9747FF"; break;
                                    case 'Processes and Technologies': strokeColor = "#636363"; break;
                                    case 'Knowledge Sharing': strokeColor = "#000000"; break;
                                    default: strokeColor = "#FF5C00";
                                }

                                linesContainer.append("path")
                                    .attr("d", `M${sourceX},${sourceY}A${dr},${dr} 0 0,1 ${targetX},${targetY}`)
                                    .attr("fill", "none")
                                    .attr("stroke", strokeColor)
                                    .attr("stroke-width", `${1.5 / currentTransform.k}`)
                                    .attr("stroke-opacity", 1);
                            }
                        });
                    })
                    .on("mouseleave", (event) => {
                        // Handle mouseleave...
                        if (!this.isPopupOpen) {
                            this.g.selectAll("image")
                                .style("opacity", 1);
                            
                            this.g.selectAll("text.category-label")
                                .style("opacity", 1);

                            linesContainer.selectAll("path").remove();
                        } else {
                            // Check if the mouse is over the popup
                            const popup = d3.select("#popup");
                            if (popup.node() && popup.node().contains(event.relatedTarget)) {
                                return; // Do nothing if mouse is over the popup
                            }
                            
                            // Close the popup if the mouse is not over it and not over a related image
                            if (this.animationInterval) {
                                clearInterval(this.animationInterval);
                                this.animationInterval = null;
                            }

                            d3.select("#popup").remove();
                            this.isPopupOpen = false;
                            this.activeNode = null;

                            this.g.selectAll("image")
                                .style("opacity", 1);
                            
                            this.g.selectAll("text.category-label")
                                .style("opacity", 1);

                            this.g.selectAll("path").remove();
                        }
                    });
            });
        });
    }

    updateVisibility() {
        if (!this.simulation || !this.g) return;

        const activeFilters = new Set();
        d3.selectAll("#filters input:checked").each(function () {
            activeFilters.add(this.value);
        });

        // Show/hide nodes based on filters
        this.g.selectAll(".node-group")
            .style("display", d =>
                activeFilters.size === 0 || activeFilters.has(d.category) ? "block" : "none"
            );

        const visibleNodes = this.nodes.filter(node =>
            activeFilters.size === 0 || activeFilters.has(node.category)
        );

        // Update simulation with visible nodes and reset their positions
        this.simulation.nodes(visibleNodes);

        visibleNodes.forEach(node => {
            if (this.initialPositions[node.id]) {
                node.x = this.initialPositions[node.id].x;
                node.y = this.initialPositions[node.id].y;
                node.fx = null;
                node.fy = null;
            }
        });

        this.simulation.alpha(0.6).restart(); // Use a smaller alpha to minimize movement
    }


    show() {
        this.svg.style("display", "block");
        this.updateVisibility();
    }

    hide() {
        if (this.svg) {
            this.svg.style("display", "none");
        }
        if (this.animationInterval) {
            clearInterval(this.animationInterval);
        }
        d3.select("#popup").remove();
    }

    destroy() {
        if (this.simulation) {
            this.simulation.stop();
        }
        if (this.svg) {
            this.svg.remove();
            this.svg = null;
        }
        if (this.animationInterval) {
            clearInterval(this.animationInterval);
        }
        d3.select("#popup").remove();
    }
}

export default GalleryView;