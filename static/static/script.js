
///////////////////////////////////////////////////////////////////////////////////
// MAP Visualization: DBH>20, colored by 5 species + "Other" w/ percentages
///////////////////////////////////////////////////////////////////////////////////

const width = 900, height = 1000;

// Creating SVG canvas for the map
const svg = d3.select("#map-container")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

// Loading Neighborhood Data
d3.json("static/SF-Neighborhoods.geo.json").then(topoData => {
    const geoData = topojson.feature(topoData, topoData.objects.SFNeighborhoods);
    const projection = d3.geoMercator().fitSize([width, height], geoData);
    const path = d3.geoPath().projection(projection);

    // Drawing neighborhoods
    svg.selectAll("path")
        .data(geoData.features)
        .enter()
        .append("path")
        .attr("d", path)
        .attr("fill", "#E0E0E0")
        .attr("stroke", "#989898")
        .attr("stroke-width", 1.5);

    // Loading Tree Data
    d3.csv("static/Street_Tree_List-2022-01-30_FILTERED.csv").then(treeData => {
        // 1) First filter DBH > 20
        const largeDBHTrees = treeData.filter(d => +d.DBH > 20);
        const totalCount = largeDBHTrees.length;

        // 2) Top 5 species by count
        const speciesCounts = d3.rollups(
            largeDBHTrees,
            v => v.length,
            d => d.qSpecies ? d.qSpecies.split("::")[0].trim() : "Unknown"
        );
        speciesCounts.sort((a, b) => b[1] - a[1]);
        const NUM_TOP_SPECIES = 5;
        const topSpecies = speciesCounts.slice(0, NUM_TOP_SPECIES).map(d => d[0]);

        // Creating a Map 
        const speciesCountMap = new Map(speciesCounts);
        const sumTopSpecies = d3.sum(topSpecies.map(sp => speciesCountMap.get(sp)));
        const otherCount = totalCount - sumTopSpecies;

        // Color scaling (top species + "Other")
        const colorScale = d3.scaleOrdinal()
            .domain([...topSpecies, "Other"])
            .range(d3.schemeSet2.slice(0, NUM_TOP_SPECIES).concat("#999999"));

        // Ploting circles
        svg.selectAll("circle.tree")
            .data(largeDBHTrees)
            .enter()
            .append("circle")
            .attr("class", "tree")
            .attr("cx", d => {
                const coords = projection([+d.Longitude, +d.Latitude]);
                return coords ? coords[0] : null;
            })
            .attr("cy", d => {
                const coords = projection([+d.Longitude, +d.Latitude]);
                return coords ? coords[1] : null;
            })
            .attr("r", 4)
            .attr("fill", d => {
                if (!d.qSpecies) return "#ccc";
                const sp = d.qSpecies.split("::")[0].trim();
                return topSpecies.includes(sp) ? colorScale(sp) : colorScale("Other");
            })
            .attr("opacity", 0.6);

        // Legend: top species + "Other", with count + percentage
        const legendArray = topSpecies.map(sp => {
            const count = speciesCountMap.get(sp) || 0;
            const pct = ((count / totalCount) * 100).toFixed(1) + "%";
            return { name: sp, count, pct };
        });

        legendArray.push({
            name: "Other",
            count: otherCount,
            pct: ((otherCount / totalCount) * 100).toFixed(1) + "%"
        });

        // 6) Drawing the legend
        const legendGroup = svg.append("g")
            .attr("id", "legend")
            .attr("transform", "translate(20, 20)");

        legendArray.forEach((item, i) => {
            const g = legendGroup.append("g")
                .attr("transform", `translate(0, ${i * 20})`);

            g.append("rect")
                .attr("width", 12)
                .attr("height", 12)
                .attr("fill", colorScale(item.name))
                .attr("opacity", 0.8);

            // Formating percentage
            const labelText = `${item.name} (${item.pct})`;
            
            g.append("text")
                .attr("x", 18)
                .attr("y", 10)
                .style("font-size", "12px")
                .text(labelText);
        });

    }).catch(error => console.error("Error loading tree data:", error));

}).catch(error => console.error("Error loading neighborhood data:", error));


/////////////////////////////////////////////////////////////////
// Grouped Bar Chart: (Border vs. Inner) x Caretaker
/////////////////////////////////////////////////////////////////

const proximityThreshold = 15;
function isNearBoundary(treeCoords, boundaryCoords) {
    return boundaryCoords.some(([x, y]) =>
        Math.hypot(treeCoords[0] - x, treeCoords[1] - y) < proximityThreshold
    );
}

// SVG for bar chart
d3.json("static/SF-Neighborhoods.geo.json").then(topoData => {
    const geoData = topojson.feature(topoData, topoData.objects.SFNeighborhoods);
    const projection = d3.geoMercator().fitSize([900, 1000], geoData);
    const path = d3.geoPath().projection(projection);

    // Precomputing boundary for later
    const boundaryCoords = geoData.features.flatMap(feature => {
        const pathString = path(feature);
        if (!pathString) return [];
        return pathString
            .split(/[ML]/)
            .filter(Boolean)
            .map(segment => segment.split(",").map(Number))
            .filter(coord => coord.length === 2);
    });

    // Extra Loading and filtering
    d3.csv("static/Street_Tree_List-2022-01-30_FILTERED.csv").then(treeData => {
        const validTreeData = treeData.filter(d => d.Longitude && d.Latitude && +d.DBH > 20);

        // Classifcation
        const classifiedTrees = validTreeData.map(tree => {
            const treeCoords = projection([+tree.Longitude, +tree.Latitude]);
            const classification = isNearBoundary(treeCoords, boundaryCoords)
                ? "Near Neighborhood Boundaries" : "Within Neighborhoods";
            return {
                ...tree,
                classification
            };
        });

        // GROUPED BAR: caretaker x classification
        const caretakerCounts = d3.rollups(
            classifiedTrees,
            v => v.length,
            d => d.qCaretaker || "Unknown"
        );
        caretakerCounts.sort((a,b) => b[1] - a[1]);
        const NUM_CARETAKERS = 2;
        const topCaretakers = caretakerCounts.slice(0, NUM_CARETAKERS).map(d => d[0]);

        // Rolling up by classification, caretaker
        const rollups = d3.rollups(
            classifiedTrees,
            v => v.length,
            d => d.classification,
            d => topCaretakers.includes(d.qCaretaker) ? d.qCaretaker : "Other"
        );

        const groupedData = rollups.map(([classification, caretakerArr]) => {
            const obj = { classification };
            caretakerArr.forEach(([ct, count]) => {
                obj[ct] = count;
            });
            return obj;
        });

        // caretaker categories
        const caretakerCategories = [...topCaretakers, "Other"];
        console.log("Grouped caretaker data:", groupedData);

        // Building grouped bar chart
        const barWidth = 600, barHeight = 400;
        const margin = { top: 60, right: 40, bottom: 60, left: 70 };

        const barSvg = d3.select("#bar-chart-container")
            .append("svg")
            .attr("width", barWidth)
            .attr("height", barHeight);

        const x0 = d3.scaleBand()
            .domain(groupedData.map(d => d.classification))
            .range([margin.left, barWidth - margin.right])
            .paddingInner(0.2);

        const x1 = d3.scaleBand()
            .domain(caretakerCategories)
            .range([0, x0.bandwidth()])
            .padding(0.1);

        const maxCount = d3.max(groupedData, d =>
            d3.max(caretakerCategories, ct => d[ct] || 0)) || 0;

        const y = d3.scaleLinear()
            .domain([0, maxCount]).nice()
            .range([barHeight - margin.bottom, margin.top]);

        // Color scaling
        const colorScale = d3.scaleOrdinal()
            .domain(caretakerCategories)
            .range(["#66c2a5", "#fc8d62", "#8da0cb"]);

            console.log("Caretaker Colors:", caretakerCategories.map(d => ({ category: d, color: colorScale(d) })));

        // Creating axis
        const xAxis = d3.axisBottom(x0);
        const yAxis = d3.axisLeft(y).ticks(8);

        barSvg.append("text")
            .attr("x", barWidth / 2)
            .attr("y", barHeight - margin.bottom + 40)
            .attr("text-anchor", "middle")
            .style("font-size", "14px")
            .text("Tree Location Relative to Neighborhood Boundaries");

        barSvg.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -barHeight / 2)
            .attr("y", margin.left - 50) 
            .attr("text-anchor", "middle")
            .style("font-size", "14px")
            .text("Number of Large Trees (DBH > 20 inches)");

        barSvg.append("g")
            .attr("class", "axis")
            .attr("transform", `translate(0, ${barHeight - margin.bottom})`)
            .call(xAxis);

        barSvg.append("g")
            .attr("class", "axis")
            .attr("transform", `translate(${margin.left},0)`)
            .call(yAxis);

        // Creating the bars
        barSvg.selectAll("g.classGroup")
            .data(groupedData)
            .enter().append("g")
            .attr("class", "classGroup")
            .attr("transform", d => `translate(${x0(d.classification)},0)`)
            .selectAll("rect")
            .data(d => caretakerCategories.map(ct => ({
                ct,
                value: d[ct] || 0,
                classification: d.classification
            })))
            .enter().append("rect")
            .attr("x", d => x1(d.ct))
            .attr("y", d => y(d.value))
            .attr("width", x1.bandwidth())
            .attr("height", d => barHeight - margin.bottom - y(d.value))
            .attr("fill", d => colorScale(d.ct));

        // Legend
        const legend = barSvg.append("g")
            .attr("transform", `translate(${barWidth - margin.right - 130}, ${margin.top})`)
            .attr("class", "caretaker-legend");

        caretakerCategories.forEach((ct, i) => {
            const legendRow = legend.append("g")
                .attr("transform", `translate(0, ${i * 20})`);

            legendRow.append("rect")
                .attr("width", 14)
                .attr("height", 14)
                .attr("fill", colorScale(ct));

            legendRow.append("text")
                .attr("x", 20)
                .attr("y", 12)
                .style("font-size", "12px")
                .text(ct);
        });

    }).catch(error => console.error("Error loading tree data:", error));

}).catch(error => console.error("Error loading neighborhood data:", error));


