class NearestView {
    constructor(containerId, useGeolocation = true) {
        this.container = d3.select(containerId);
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.svg = null;
        this.simulation = null;
        this.g = null;
        this.nodes = [];
        this.clusteredNodes = [];
        this.userLocation = null;
        this.maxDistance = 0;
        this.isPopupOpen = false;
        this.useGeolocation = useGeolocation;
        this.circleRadii = useGeolocation ? [100, 250, 400, 550, 700] : [];
        this.currentZoomLevel = 1;
        this.zoomThreshold = 1.5; // Threshold for when to split clusters
    }

    async loadData() {
        try {
            const response = await d3.csv("https://docs.google.com/spreadsheets/d/e/2PACX-1vTbrRaZpcg6BmaLBiN1L5OF3MQ_hxr066EdOZlst486ALo-JcrBZBFyAO0wuC9I4zj7X_gpBY2YZrVF/pub?gid=0&single=true&output=csv");

            this.nodes = response
                .filter(d => d.Latitude && d.Longitude)
                .map(d => ({
                    id: d.Name,
                    latitude: parseFloat(d.Latitude),
                    longitude: parseFloat(d.Longitude),
                    description: d.Description,
                    website: d.Website,  // Corretto il nome della proprietà
                    location: d.Location,
                    'IG Link': d['IG Link'],
                    'Linkedin Link': d['Linkedin Link']
                }));

            if (!this.useGeolocation) {
                this.clusterNodes();  // Only cluster if not using geolocation
            }
        } catch (error) {
            console.error("Error loading data:", error);
        }
    }

    calculateGeoDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // Distance in kilometers
    }

    toRad(degree) {
        return degree * Math.PI / 180;
    }

    async initialize() {
        this.svg = this.container.append("svg")
            .attr("width", this.width)
            .attr("height", this.height)
            .style("background-color", "#ECECEC");

        this.g = this.svg.append("g");

        if (this.useGeolocation) {
            this.circleRadii.forEach(radius => {
                this.g.append("circle")
                    .attr("cx", this.width / 2)
                    .attr("cy", this.height / 2)
                    .attr("r", radius)
                    .attr("fill", "none")
                    .attr("stroke", "#FF5C00")
                    .attr("stroke-width", 1)
                    .attr("stroke-opacity", 0.2)
                    .attr("class", "distance-circle");
            });
        }

        const zoom = d3.zoom()
            .scaleExtent([0.7, 5])
            .on("zoom", (event) => {
                this.currentZoomLevel = event.transform.k;
                this.g.attr("transform", event.transform);

                // Update node visibility based on zoom level
                this.updateNodesForZoom(event.transform.k);

                // Apply inverse transform to visible nodes
                this.g.selectAll(".node").each(function () {
                    const node = d3.select(this);
                    node.selectAll("circle")
                        .attr("transform", `scale(${1 / event.transform.k})`);
                    node.select("text")
                        .attr("transform", `scale(${1 / event.transform.k})`);
                });

                this.g.selectAll(".distance-circle")
                    .attr("stroke-width", `${1 / event.transform.k}px`);

                this.g.select(".user-point")
                    .attr("transform", `scale(${1 / event.transform.k})`);
            });

        this.svg.call(zoom);

        await this.loadData();
        await this.getUserLocation();
        if (this.useGeolocation) {
            this.calculateDistances();
        }
        this.clusterNodes();
        this.createSimulation();
        this.render();
    }

    clusterNodes() {
        if (this.useGeolocation) return; // Skip clustering if using geolocation

        // Group nodes by location
        const locationGroups = {};
        this.nodes.forEach(node => {
            const key = `${node.latitude},${node.longitude}`;
            if (!locationGroups[key]) {
                locationGroups[key] = [];
            }
            locationGroups[key].push(node);
        });

        // Create clustered nodes array
        this.clusteredNodes = Object.entries(locationGroups).map(([key, nodes]) => {
            const [lat, lng] = key.split(',').map(Number);
            if (nodes.length === 1) {
                return { ...nodes[0], isCluster: false };
            }
            return {
                id: `cluster-${key}`,
                latitude: lat,
                longitude: lng,
                isCluster: true,
                nodeCount: nodes.length,
                containedNodes: nodes,
                description: `Group of ${nodes.length} locations`,
                distance: nodes[0].distance // Use distance from first node if available
            };
        });
    }

    updateNodesForZoom(zoomLevel) {
        if (this.useGeolocation) return; // Skip if using geolocation

        if (zoomLevel >= this.zoomThreshold) {
            // Hide clusters
            this.g.selectAll(".node")
                .filter(d => d.isCluster)
                .style("display", "none");

            // Show and position individual nodes
            this.clusteredNodes.forEach(cluster => {
                if (cluster.isCluster) {
                    const clusterX = cluster.x;
                    const clusterY = cluster.y;
                    const nodeCount = cluster.containedNodes.length;

                    // Calculate radius for node distribution based on cluster size
                    const distributionRadius = 30;  // Base radius for distribution

                    cluster.containedNodes.forEach((node, index) => {
                        // Calculate position in a circle around the cluster center
                        const angle = (2 * Math.PI * index) / nodeCount;
                        node.x = clusterX + distributionRadius * Math.cos(angle);
                        node.y = clusterY + distributionRadius * Math.sin(angle);

                        const individualNode = this.g.select(`#node-${node.id}`);
                        if (individualNode.empty()) {
                            this.addIndividualNode(node);
                        } else {
                            individualNode
                                .style("display", "block")
                                .attr("transform", `translate(${node.x},${node.y})`);
                        }
                    });
                }
            });
        } else {
            // Show clusters, hide individual nodes
            this.g.selectAll(".node")
                .style("display", d => d.isCluster ? "block" :
                    (this.isNodePartOfCluster(d) ? "none" : "block"));
        }
    }

    isNodePartOfCluster(node) {
        return this.clusteredNodes.some(cluster =>
            cluster.isCluster && cluster.containedNodes.some(n => n.id === node.id));
    }

    addIndividualNode(nodeData) {
        const node = this.g.append("g")
            .datum(nodeData)
            .attr("class", "node")
            .attr("id", `node-${nodeData.id}`)
            .attr("transform", `translate(${nodeData.x},${nodeData.y})`);

        // Add transition for smooth appearance
        node.style("opacity", 0)
            .transition()
            .duration(300)
            .style("opacity", 1);

        node.append("circle")
            .attr("r", 12)
            .attr("stroke", "#FF5C00")
            .attr("stroke-width", 2)
            .attr("fill", "none");

        node.append("text")
            .attr("dy", -20)
            .attr("text-anchor", "middle")
            .attr("class", "font-size-medium-small")
            .text(nodeData.id);

        node.on("click", (event, d) => {
            event.stopPropagation();
            this.createPopup(d);
        });

        return node;
    }

    render() {
        this.g.selectAll(".node").remove();

        if (this.useGeolocation && this.userLocation) {
            const userLocationGroup = this.g.append("g")
                .attr("class", "user-location")
                .attr("transform", `translate(${this.width / 2},${this.height / 2})`);

            userLocationGroup.append("circle")
                .attr("r", 8)
                .attr("fill", "#FF5C00")
                .attr("class", "user-point");
        }

        // Create nodes based on mode
        const nodeData = this.useGeolocation ? this.nodes :
            (this.currentZoomLevel >= this.zoomThreshold ? this.nodes : this.clusteredNodes);

        const nodes = this.g.selectAll(".node")
            .data(nodeData)
            .enter()
            .append("g")
            .attr("class", "node")
            .attr("id", d => `node-${d.id}`);

        // Add circles with different sizes for clusters (only in non-geolocation mode)
        nodes.append("circle")
            .attr("r", d => !this.useGeolocation && d.isCluster ? 12 + (d.nodeCount * 3) : 12)
            .attr("stroke", "#FF5C00")
            .attr("stroke-width", 2)
            .attr("fill", "none");

        // Add labels
        nodes.append("text")
            .attr("dy", -20)
            .attr("text-anchor", "middle")
            .attr("class", "font-size-medium-small")
            .text(d => !this.useGeolocation && d.isCluster ? `+${d.nodeCount}` : d.id);

        // Add click handlers with conditional cluster popup
        nodes.on("click", (event, d) => {
            event.stopPropagation();
            if (!this.useGeolocation && d.isCluster && this.currentZoomLevel < this.zoomThreshold) {
                this.createClusterPopup(d);
            } else {
                this.createPopup(d);
            }
        });

        if (this.useGeolocation) {
            nodes.call(d3.drag()
                .on("start", (event, d) => {
                    if (!event.active) this.simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                })
                .on("drag", (event, d) => {
                    d.fx = event.x;
                    d.fy = event.y;
                })
                .on("end", (event, d) => {
                    if (!event.active) this.simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                }));
        }
    }

    createClusterPopup(cluster) {
        if (this.useGeolocation) return;

        d3.select("#popup").remove();

        // Get the shared location from any node in the cluster
        const sharedLocation = cluster.containedNodes[0].location || "Unknown Location";

        const popup = d3.select("body").append("div")
            .attr("id", "popup")
            .attr("class", "visible");

        const content = `
            <button id="close-popup" class="popup-close">×</button>
            <h3>${sharedLocation}</h3>
            <p>${cluster.nodeCount} locations in this area</p>
            <div class="popup-line"></div>
            <div class="connected-category">
                <h3>Urban Producers</h3>
                <div class="connected-nodes-container">
                    ${cluster.containedNodes.map(node => `
                        <label class="connected-node-label">
                            <button class="connected-node-btn font-size-small" data-node-id="${node.id}">
                                ${node.id}
                            </button>
                        </label>
                    `).join('')}
                </div>
            </div>
        `;

        popup.html(content);

        // Handle popup close button
        d3.select("#close-popup").on("click", () => {
            popup.remove();
            this.isPopupOpen = false;
        });

        // Handle clicks on individual nodes in the cluster
        d3.selectAll(".connected-node-btn").on("click", (event) => {
            const nodeId = event.target.getAttribute("data-node-id");
            const node = cluster.containedNodes.find(n => n.id === nodeId);
            if (node) {
                // Remove cluster popup and show individual node popup
                d3.select("#popup").remove();
                this.createPopup(node);
            }
        });

        this.isPopupOpen = true;
    }

    createPopup(d) {
        d3.select("#popup").remove();

        const popup = d3.select("body").append("div")
            .attr("id", "popup")
            .attr("class", "visible");

        const linksSection = `
            <div class="popup-links">
                ${d.website ? `
                <label class="link-label">
                    <a href="${d.website}" target="_blank" class="popup-link font-size-small">Website</a>
                </label>
                ` : ''}
                ${d['IG Link'] ? `
                <label class="link-label">
                    <a href="${d['IG Link']}" target="_blank" class="popup-link font-size-small">Instagram</a>
                </label>
                ` : ''}
                ${d['Linkedin Link'] ? `
                <label class="link-label">
                    <a href="${d['Linkedin Link']}" target="_blank" class="popup-link font-size-small">LinkedIn</a>
                </label>
                ` : ''}
            </div>
        `;

        const content = `
            <button id="close-popup" class="popup-close">×</button>
            ${this.useGeolocation && d.distance ? `<div>Distance: ${d.distance.toFixed(1)} km</div>` : ''}
            <h3>${d.id}</h3>
            ${d.location ? `<div><p>${d.location}</p></div>` : ''}
            ${d.description ? `<div><p>${d.description}</p></div>` : ''}
            ${linksSection}
        `;

        popup.html(content);

        d3.select("#close-popup").on("click", () => {
            popup.remove();
            this.isPopupOpen = false;
        });

        this.isPopupOpen = true;
    }

    show() {
        if (this.svg) {
            this.svg.style("display", "block");
        }
    }

    hide() {
        if (this.svg) {
            this.svg.style("display", "none");
        }
        if (this.isPopupOpen) {
            d3.select("#popup").remove();
            this.isPopupOpen = false;
        }
    }

    destroy() {
        if (this.simulation) {
            this.simulation.stop();
        }
        if (this.svg) {
            this.svg.remove();
            this.svg = null;
        }
        if (this.isPopupOpen) {
            d3.select("#popup").remove();
            this.isPopupOpen = false;
        }
    }

    async getUserLocation() {
        return new Promise((resolve, reject) => {
            if (this.useGeolocation && "geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        this.userLocation = {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude
                        };
                        resolve(this.userLocation);
                    },
                    (error) => {
                        console.error("Error getting location:", error);
                        this.useGeolocation = false;
                        this.circleRadii = [];
                        resolve(null);
                    }
                );
            } else {
                console.warn("Geolocation not available or not allowed");
                this.useGeolocation = false;
                this.circleRadii = [];
                resolve(null);
            }
        });
    }

    calculateDistances() {
        if (!this.userLocation) return;

        this.nodes.forEach(node => {
            node.distance = this.calculateGeoDistance(
                this.userLocation.latitude,
                this.userLocation.longitude,
                node.latitude,
                node.longitude
            );
        });

        this.maxDistance = Math.max(...this.nodes.map(n => n.distance));
    }

    createSimulation() {
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const maxRadius = Math.min(this.width, this.height) / 1.8;

        if (this.useGeolocation) {
            // Use non-clustered nodes and radial layout for geolocation mode
            this.simulation = d3.forceSimulation(this.nodes)
                .force("center", d3.forceCenter(centerX, centerY))
                .force("radial", d3.forceRadial(d => {
                    const normalizedDistance = (d.distance / this.maxDistance) || 0.5;
                    return normalizedDistance * maxRadius;
                }).strength(1.2).x(centerX).y(centerY))
                .force("collision", d3.forceCollide().radius(60).strength(0.7))
                .force("charge", d3.forceManyBody().strength(-100));
        } else {
            // Use clustered nodes and geographical projection for non-geolocation mode
            const projection = d3.geoMercator()
                .center([2.3522, 48.8566])
                .scale(Math.min(this.width, this.height) * 3)
                .translate([centerX, centerY]);

            this.clusteredNodes.forEach(d => {
                if (d.longitude && d.latitude) {
                    const coords = projection([d.longitude, d.latitude]);
                    d.x = coords[0];
                    d.y = coords[1];
                }
            });

            this.simulation = d3.forceSimulation(this.clusteredNodes)
                .force("x", d3.forceX(d => d.x || centerX).strength(0.1))
                .force("y", d3.forceY(d => d.y || centerY).strength(0.1))
                .force("collision", d3.forceCollide().radius(d =>
                    d.isCluster ? (12 + (d.nodeCount * 3)) : 60).strength(0.7))
                .force("charge", d3.forceManyBody().strength(-100));
        }

        this.simulation.on("tick", () => this.updateNodePositions());
    }

    updateNodePositions() {
        this.g.selectAll(".node")
            .attr("transform", d => {
                // Ensure we have valid coordinates
                const x = isNaN(d.x) ? this.width / 2 : d.x;
                const y = isNaN(d.y) ? this.height / 2 : d.y;
                return `translate(${x},${y})`;
            });
    }
}

export default NearestView;