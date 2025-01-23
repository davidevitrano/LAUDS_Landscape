class NearestView {
    constructor(containerId, useGeolocation = true) {
        this.container = d3.select(containerId);
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.svg = null;
        this.g = null;
        this.nodes = [];
        this.userLocation = null;
        this.maxDistance = 0;
        this.isPopupOpen = false;
        this.useGeolocation = useGeolocation;
        this.currentZoomLevel = 1;
        this.margin = { left: 100, right: 50, top: 50, bottom: 50 };
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
                    website: d.Website,
                    location: d.Location,
                    'IG Link': d['IG Link'],
                    'Linkedin Link': d['Linkedin Link']
                }));
        } catch (error) {
            console.error("Error loading data:", error);
        }
    }

    calculateGeoDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
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

        const zoom = d3.zoom()
            .scaleExtent([1, 5])
            .on("zoom", (event) => {
                this.currentZoomLevel = event.transform.k;
                this.g.attr("transform", event.transform);
                this.updateNodeScaling(event.transform.k);
            });

        this.svg.call(zoom);

        await this.loadData();
        
        if (this.useGeolocation) {
            await this.getUserLocation();
            this.calculateDistances();
            this.positionNodesWithGeolocation();
        } else {
            this.positionNodesWithoutGeolocation();
        }
        
        this.render();
    }

    positionNodesWithGeolocation() {
        const nodesByDistance = d3.group(this.nodes, d => Math.round(d.distance * 10) / 10);
        
        const xScale = d3.scaleLinear()
            .domain([0, this.maxDistance])
            .range([this.margin.left, this.width - this.margin.right]);

        const sortedDistances = Array.from(nodesByDistance.keys()).sort((a, b) => a - b);
        
        sortedDistances.forEach((distance, groupIndex) => {
            const nodes = nodesByDistance.get(distance);
            const x = xScale(distance);
            
            const nearbyNodes = [];
            for (let i = Math.max(0, groupIndex - 7); i < groupIndex; i++) {
                const nearbyDistance = sortedDistances[i];
                if (Math.abs(distance - nearbyDistance) < 140) {
                    const nodesAtDistance = nodesByDistance.get(nearbyDistance);
                    nearbyNodes.push(...nodesAtDistance);
                }
            }
            
            nodes.forEach((node, i) => {
                node.x = x;
                
                const baseSpacing = this.height / (nodes.length + 1);
                let y = baseSpacing * (i + 1);
                
                let attempts = 0;
                const minVerticalDistance = 55;
                
                while (attempts < 10) {
                    const overlap = nearbyNodes.some(nearNode => 
                        Math.abs(nearNode.y - y) < minVerticalDistance
                    );
                    
                    if (!overlap) break;
                    
                    y += (attempts % 2 === 0 ? 1 : -1) * minVerticalDistance;
                    attempts++;
                }
                
                y = Math.max(this.margin.top, Math.min(y, this.height - this.margin.bottom));
                node.y = y;
            });
        });
    }

    positionNodesWithoutGeolocation() {
        const minLat = d3.min(this.nodes, d => d.latitude);
        const maxLat = d3.max(this.nodes, d => d.latitude);
        const minLon = d3.min(this.nodes, d => d.longitude);
        const maxLon = d3.max(this.nodes, d => d.longitude);

        const xScale = d3.scaleLinear()
            .domain([minLon, maxLon])
            .range([this.margin.left, this.width - this.margin.right]);

        const yScale = d3.scaleLinear()
            .domain([minLat, maxLat])
            .range([this.height - this.margin.bottom, this.margin.top]);

        this.nodes.forEach(node => {
            node.x = xScale(node.longitude);
            node.y = yScale(node.latitude);
        });
    }

    updateNodeScaling(scale) {
        // Scale regular nodes only (not user location)
        this.g.selectAll(".node:not(.user-node)").each(function() {
            const node = d3.select(this);
            node.selectAll("circle")
                .attr("transform", `scale(${1 / scale})`);
            node.select("text")
                .attr("transform", `scale(${1 / scale})`);
        });
        
        // Scale distance scale text only (lines have vector-effect)
        this.g.selectAll(".distance-scale").each(function() {
            const scaleGroup = d3.select(this);
            scaleGroup.selectAll(".scale-text")
                .attr("transform", `scale(${1 / scale})`);
        });
    }

    render() {
        this.g.selectAll(".node").remove();

        if (this.useGeolocation && this.userLocation) {
            // Create distance scale group
            const scaleGroup = this.g.append("g")
                .attr("class", "distance-scale")
                .attr("transform", `translate(${this.margin.left / 2},${this.height / 2})`);

            // Add main horizontal line with non-scaling stroke
            scaleGroup.append("line")
                .attr("class", "scale-line")
                .attr("x1", 0)
                .attr("y1", 0)
                .attr("x2", this.width - this.margin.right - this.margin.left / 2)
                .attr("y2", 0)
                .attr("stroke", "#636363")
                .attr("vector-effect", "non-scaling-stroke")
                .style("stroke-width", "1px");

            // Add distance markers every 100km
            const maxKm = Math.ceil(this.maxDistance / 100) * 100;
            const xScale = d3.scaleLinear()
                .domain([0, maxKm])
                .range([0, this.width - this.margin.right - this.margin.left / 2]);

            for (let km = 0; km <= maxKm; km += 100) {
                const markerGroup = scaleGroup.append("g")
                    .attr("transform", `translate(${xScale(km)}, 0)`);

                // Vertical tick with non-scaling stroke
                markerGroup.append("line")
                    .attr("class", "scale-tick")
                    .attr("x1", 0)
                    .attr("y1", -5)
                    .attr("x2", 0)
                    .attr("y2", 5)
                    .attr("stroke", "#636363")
                    .attr("vector-effect", "non-scaling-stroke")
                    .style("stroke-width", "1px");

                // Distance label with fixed size
                markerGroup.append("text")
                    .attr("y", 20)
                    .attr("text-anchor", "middle")
                    .attr("class", "font-size-small scale-text")
                    .style("transform-origin", "center")
                    .style("transform-box", "fill-box")
                    .text(km);
            }

            // Add "km" label at the start with fixed size
            scaleGroup.append("text")
                .attr("x", -25)
                .attr("y", 20)
                .attr("text-anchor", "end")
                .attr("class", "font-size-small scale-text")
                .style("transform-origin", "center")
                .style("transform-box", "fill-box")
                .text("(km)");

            // Add user location point
            const userNode = this.g.append("g")
                .attr("class", "node user-node")
                .attr("transform", `translate(${this.margin.left / 2},${this.height / 2})`);

            userNode.append("circle")
                .attr("r", 12)
                .attr("fill", "#FF5C00")
                .attr("class", "user-location-point");
        }

        const nodes = this.g.selectAll(".node:not(.user-node)")
            .data(this.nodes)
            .enter()
            .append("g")
            .attr("class", "node")
            .attr("transform", d => `translate(${d.x},${d.y})`);

        nodes.append("circle")
            .attr("r", 12)
            .attr("stroke", "#FF5C00")
            .attr("stroke-width", 2)
            .attr("fill", "none");

        nodes.append("text")
            .attr("dy", -20)
            .attr("text-anchor", "middle")
            .attr("class", "font-size-small")
            .text(d => d.id);

        nodes.on("click", (event, d) => {
            event.stopPropagation();
            this.createPopup(d);
        });
    }

    createPopup(d) {
        d3.select("#popup").remove();

        const popup = d3.select("body").append("div")
            .attr("id", "popup")
            .attr("class", "visible");

        const linksSection = `
            <div class="popup-links">
                ${d.website ? `<label class="link-label">
                    <a href="${d.website}" target="_blank" class="popup-link font-size-small">Website</a>
                </label>` : ''}
                ${d['IG Link'] ? `<label class="link-label">
                    <a href="${d['IG Link']}" target="_blank" class="popup-link font-size-small">Instagram</a>
                </label>` : ''}
                ${d['Linkedin Link'] ? `<label class="link-label">
                    <a href="${d['Linkedin Link']}" target="_blank" class="popup-link font-size-small">LinkedIn</a>
                </label>` : ''}
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
                        resolve(null);
                    }
                );
            } else {
                this.useGeolocation = false;
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
        if (this.svg) {
            this.svg.remove();
            this.svg = null;
        }
        if (this.isPopupOpen) {
            d3.select("#popup").remove();
            this.isPopupOpen = false;
        }
    }
}

export default NearestView;