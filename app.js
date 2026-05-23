        document.addEventListener('DOMContentLoaded', () => {
            
            // --- GESTION DU DARK MODE ---
            const themeToggleBtn = document.getElementById('theme-toggle-btn');
            const themeToggleDarkIcon = document.getElementById('theme-toggle-dark-icon');
            const themeToggleLightIcon = document.getElementById('theme-toggle-light-icon');
            const body = document.body;
            
            function updateThemeIcons() {
                if (body.classList.contains('dark-mode')) {
                    if (themeToggleLightIcon) themeToggleLightIcon.style.display = 'block';
                    if (themeToggleDarkIcon) themeToggleDarkIcon.style.display = 'none';
                } else {
                    if (themeToggleDarkIcon) themeToggleDarkIcon.style.display = 'block';
                    if (themeToggleLightIcon) themeToggleLightIcon.style.display = 'none';
                }
            }

            const currentTheme = localStorage.getItem('theme');
            if (currentTheme === 'dark') {
                body.classList.add('dark-mode');
            }
            updateThemeIcons();

            if (themeToggleBtn) {
                themeToggleBtn.addEventListener('click', () => {
                    body.classList.toggle('dark-mode');
                    localStorage.setItem('theme', body.classList.contains('dark-mode') ? 'dark' : 'light');
                    updateThemeIcons();
                });
            }

            // --- GESTION DES ONGLETS AVEC HISTORIQUE (BACK BUTTON) ---
            const tabButtons = document.querySelectorAll('.tab-button');
            const tabContents = document.querySelectorAll('.tab-content');

            // Fonction unifiée pour changer d'onglet
            function switchTab(tabId, updateHistory = true) {
                // 1. Gestion de l'affichage (Classes Active)
                tabButtons.forEach(btn => {
                    btn.classList.remove('active');
                    if (btn.getAttribute('data-tab') === tabId) {
                        btn.classList.add('active');
                    }
                });

                tabContents.forEach(content => {
                    content.classList.remove('active');
                    if (content.id === tabId) {
                        content.classList.add('active');
                    }
                });

                // 2. Logiques spécifiques aux onglets
                if (tabId === 'favorites') {
                    renderFavoritesList();
                }
                if (tabId === 'quiz' && quizCurrentQuestionIndex === -1) { 
                     loadQuizQuestion();
                }

                // 3. Mise à jour de l'historique du navigateur
                if (updateHistory) {
                    history.pushState({ tab: tabId }, '', `#${tabId}`);
                }
            }

            // Écouteur sur les boutons (Clics menu et Tuiles Accueil)
            tabButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    // Si le clic vient d'un script (ex: tuiles accueil), on laisse faire
                    // Sinon, on gère l'historique
                    const tabId = button.getAttribute('data-tab');
                    
                    // Petit hack : si le clic est déclenché manuellement par les tuiles via .click(), 
                    // on veut aussi update l'historique, donc on appelle switchTab
                    
                    // On désactive le comportement par défaut de l'ancien listener s'il en reste un
                    e.preventDefault(); 
                    switchTab(tabId, true);
                });
            });

            // Écouteur sur le bouton "Précédent" du navigateur/souris (Popstate)
            window.addEventListener('popstate', (event) => {
                if (event.state && event.state.tab) {
                    switchTab(event.state.tab, false);
                } else {
                    switchTab('home', false);
                }
            });

            // --- GESTION DES BOUTONS D'AJOUT DE RÉSEAUX (DYNAMIQUES) ---
            document.querySelectorAll('.btn-add-host').forEach(btn => {
                btn.addEventListener('click', () => {
                    const targetId = btn.getAttribute('data-target');
                    const listContainer = document.getElementById(targetId);
                    if (!listContainer) return;
                    
                    const rowCount = listContainer.querySelectorAll('.host-req-row').length;
                    // Calcul de la prochaine lettre (A=65). Si plus de 26, on recommence à A1, B1, etc.
                    const nextLetter = String.fromCharCode(65 + (rowCount % 26)); 
                    const nameBase = rowCount >= 26 ? `Réseau ${nextLetter}${Math.floor(rowCount/26)}` : `Réseau ${nextLetter}`;
                    
                    const row = document.createElement('div');
                    row.className = 'host-req-row';
                    row.innerHTML = `<input type="text" class="host-req-name" value="${nameBase}" placeholder="Nom"><input type="number" class="host-req-count" min="1" placeholder="Hôtes">`;
                    listContainer.appendChild(row);
                });
            });

            
            // --- CŒUR : FONCTIONS DE CALCUL IP ---
            
            function ipToLong(ip) {
                if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return null;
                const octets = ip.split('.').map(Number);
                if (octets.some(octet => octet < 0 || octet > 255)) return null;
                return octets.reduce((acc, octet) => (acc << 8) + octet, 0) >>> 0;
            }
            function longToIp(long) {
                return [(long >>> 24), (long >>> 16) & 255, (long >>> 8) & 255, long & 255].join('.');
            }
            function hostsToCidr(hosts) {
                if (hosts < 0) hosts = 0;
                if (hosts === 0) hosts = 2; 
                if (hosts <= 2) {
                    return 30; 
                }
                const requiredBits = Math.ceil(Math.log2(hosts + 2));
                return 32 - requiredBits;
            }
            function cidrToSize(cidr) {
                return Math.pow(2, 32 - cidr);
            }
            function cidrToMask(cidr) {
                if (cidr < 0 || cidr > 32) return null;
                if (cidr === 0) return "0.0.0.0";
                const maskLong = ((0xFFFFFFFF << (32 - cidr)) & 0xFFFFFFFF) >>> 0;
                return longToIp(maskLong);
            }
            function maskToWildcard(maskStr) {
                 const maskLong = ipToLong(maskStr);
                 if (maskLong === null) return null;
                 return longToIp((~maskLong) >>> 0);
            }
            function parseMask(maskStr) {
                if (!maskStr) return null;
                if (maskStr.startsWith('/')) {
                    const cidr = parseInt(maskStr.substring(1), 10);
                    return (cidr >= 0 && cidr <= 32) ? cidr : null;
                } else if (maskStr.includes('.')) {
                    const maskLong = ipToLong(maskStr);
                    if (maskLong === null) return null;
                    const inverted = (~maskLong) >>> 0;
                    if (((inverted + 1) & inverted) !== 0 && maskLong !== 0 && maskLong !== 0xFFFFFFFF) return null; 
                    const binaryString = maskLong.toString(2).padStart(32, '0');
                    const cidr = binaryString.indexOf('0');
                    return cidr === -1 ? 32 : cidr;
                }
                return null;
            }

            // --- Générateur d'explications de formules (MODIFIÉ) ---
            function generateFormulaExplanation(subnetData, exerciseType = 'hosts', baseCidr = null, numNetworks = null) {
                 const cidrVal = parseInt(subnetData.cidr.substring(1));
                 const hostBits = 32 - cidrVal;
                 const subnetSize = cidrToSize(cidrVal);

                 let explanation = `<details><summary>Comment calculer ?</summary>`;

                 if (exerciseType === 'network' && baseCidr !== null && numNetworks !== null) {
                     // MODIF : Explication adaptée aux nombres non puissances de 2
                     const bitsBorrowed = Math.ceil(Math.log2(numNetworks));
                     const totalSlots = Math.pow(2, bitsBorrowed);
                     
                     explanation += `<p>1. <strong>Bits Empruntés :</strong> Pour ${numNetworks} réseaux, il faut trouver la puissance de 2 supérieure ou égale (ici ${totalSlots}).</p>`;
                     explanation += `<p>Cela nécessite <code>log<sub>2</sub>(${totalSlots}) = ${bitsBorrowed}</code> bits supplémentaires pour la partie réseau.</p>`;
                     explanation += `<p>2. <strong>Nouveau CIDR :</strong> CIDR initial (${baseCidr}) + bits empruntés (${bitsBorrowed}) = <code>/${cidrVal}</code>.</p>`;
                 } else { 
                      explanation += `<p>1. <strong>Taille Bloc :</strong> Pour <code>${subnetData.hosts}</code> hôtes, il faut <code>${subnetData.hosts} + 2</code> (ID+Broadcast) adresses. La plus petite puissance de 2 >= ${subnetData.hosts + 2} est <code>${subnetSize}</code>.</p>`;
                      explanation += `<p>2. <strong>Bits Hôtes :</strong> Une taille de ${subnetSize} correspond à <code>log<sub>2</sub>(${subnetSize}) = ${hostBits}</code> bits pour la partie hôte.</p>`;
                      explanation += `<p>3. <strong>CIDR :</strong> Nombre total de bits (32) - bits hôte (${hostBits}) = <code>/${cidrVal}</code>.</p>`;
                 }

                 explanation += `<p>4. <strong>Masque :</strong> Le CIDR /${cidrVal} équivaut au masque <code>${subnetData.mask}</code>.</p>`;
                 explanation += `<p>5. <strong>ID Réseau :</strong> C'est la 1ère adresse du bloc alloué (ici <code>${subnetData.networkId}</code>).</p>`;
                 explanation += `<p>6. <strong>Broadcast :</strong> C'est la dernière adresse du bloc (ID + Taille - 1 = <code>${subnetData.broadcast}</code>).</p>`;

                 if (cidrVal <= 30) {
                      explanation += `<p>7. <strong>IP Utilisables :</strong> De <code>ID + 1</code> (=${subnetData.firstIp}) à <code>Broadcast - 1</code> (=${subnetData.lastIp}).</p>`;
                 } else if (cidrVal === 31) {
                      explanation += `<p>7. <strong>IP Utilisables (/31) :</strong> Les 2 adresses <code>${subnetData.firstIp}</code> et <code>${subnetData.lastIp}</code> sont utilisables (liaison point-à-point).</p>`;
                 } else { 
                      explanation += `<p>7. <strong>IP Utilisable (/32) :</strong> Seulement <code>${subnetData.networkId}</code>.</p>`;
                 }

                 explanation += `</details>`;
                 return explanation;
            }

            // --- Fonctions de calcul VLSM & Classique ---
            function calculateClassicSubnetting(baseIp, baseCidr, subnets) { 
                let currentIpLong = ipToLong(baseIp);
                if (currentIpLong === null) return { solution: [], error: "Adresse IP de base invalide." };
                const maxHosts = Math.max(...subnets.map(s => s.hosts));
                const requiredCidr = hostsToCidr(maxHosts);
                const subnetSize = cidrToSize(requiredCidr);
                const totalRequiredSize = subnetSize * subnets.length;
                const availableSize = cidrToSize(baseCidr);
                if (totalRequiredSize > availableSize) {
                    return { solution: [], error: `Espace insuffisant. ${subnets.length} réseaux de taille /${requiredCidr} sont requis.` };
                }
                const solution = [];
                for (const subnet of subnets) {
                    const networkIdLong = currentIpLong;
                    const broadcastLong = (currentIpLong + subnetSize - 1) >>> 0;
                    const firstIpLong = (networkIdLong + 1) >>> 0;
                    const lastIpLong = (broadcastLong - 1) >>> 0;
                    solution.push({
                        name: subnet.name, hosts: subnet.hosts, networkId: longToIp(networkIdLong),
                        mask: cidrToMask(requiredCidr), cidr: `/${requiredCidr}`,
                        firstIp: longToIp(firstIpLong), lastIp: longToIp(lastIpLong),
                        broadcast: longToIp(broadcastLong)
                    });
                    currentIpLong = (broadcastLong + 1) >>> 0;
                }
                return { solution, error: null };
            }

            function calculateVLSM(baseIp, baseCidr, subnets) { 
                let currentIpLong = ipToLong(baseIp);
                if (currentIpLong === null) return { solution: [], error: "Adresse IP de base invalide." };
                const sortedSubnets = [...subnets].sort((a, b) => b.hosts - a.hosts);
                const solution = [];
                let error = null;
                const baseNetworkSize = cidrToSize(baseCidr);
                const baseNetworkEnd = (currentIpLong + baseNetworkSize - 1) >>> 0;

                for (const subnet of sortedSubnets) {
                    const requiredCidr = hostsToCidr(subnet.hosts);
                    const subnetSize = cidrToSize(requiredCidr);
                    if (requiredCidr < 31) { 
                            const alignMask = 0xFFFFFFFF << (32 - requiredCidr);
                            if ((currentIpLong & ~alignMask) !== 0) { 
                                currentIpLong = ((currentIpLong & alignMask) + subnetSize) >>> 0; 
                            }
                    }
                    const currentNetEnd = (currentIpLong + subnetSize - 1) >>> 0;
                    if (currentIpLong < ipToLong(baseIp) || currentNetEnd > baseNetworkEnd || currentNetEnd < currentIpLong) { 
                        error = "Espace d'adressage insuffisant (VLSM).";
                        break;
                    }

                    const networkIdLong = currentIpLong;
                    const broadcastLong = currentNetEnd;
                    let firstIpLong, lastIpLong;
                     if (requiredCidr === 32) { firstIpLong = networkIdLong; lastIpLong = networkIdLong; }
                     else if (requiredCidr === 31) { firstIpLong = networkIdLong; lastIpLong = broadcastLong; }
                     else { firstIpLong = (networkIdLong + 1) >>> 0; lastIpLong = (broadcastLong - 1) >>> 0; }
                     
                    solution.push({
                        name: subnet.name, hosts: subnet.hosts, networkId: longToIp(networkIdLong),
                        mask: cidrToMask(requiredCidr), cidr: `/${requiredCidr}`,
                        firstIp: longToIp(firstIpLong), lastIp: longToIp(lastIpLong),
                        broadcast: longToIp(broadcastLong)
                    });
                    currentIpLong = (broadcastLong + 1) >>> 0;
                     if (currentIpLong === 0 && solution.length < sortedSubnets.length) {
                          error = "Dépassement de l'espace d'adressage 32 bits.";
                          break;
                     }
                }
                return { solution, error };
            }
            
            // --- MODIFIÉ : Calcul Segmentation par nombre de réseaux (supporte non-puissance de 2) ---
            function calculateSegmentationByNetworkSolution(baseIp, baseCidr, N) {
                const baseIpLong = ipToLong(baseIp);
                
                // MODIF: On accepte tout N >= 2
                if (baseIpLong === null || N < 2) { 
                    return { solution: [], error: "Le nombre de réseaux doit être au moins 2." };
                }
                
                // MODIF: Utilisation de Ceil pour calculer les bits nécessaires
                const bitsNeeded = Math.ceil(Math.log2(N));
                const newCidr = baseCidr + bitsNeeded;
                
                if (newCidr > 32) {
                    return { solution: [], error: `Impossible de créer ${N} réseaux : masque dépasse /32.` };
                }
                
                const subnetSize = cidrToSize(newCidr);
                const solution = [];
                let currentIpLong = baseIpLong;

                for (let i = 0; i < N; i++) {
                     const networkIdLong = currentIpLong;
                     const broadcastLong = (currentIpLong + subnetSize - 1) >>> 0;
                     let firstIpLong = networkIdLong; 
                     let lastIpLong = broadcastLong; 
                     
                      if(newCidr === 32) { /* Do nothing */ }
                      else if (newCidr === 31) { /* Do nothing */ }
                      else { 
                         firstIpLong = (networkIdLong + 1) >>> 0;
                         lastIpLong = (broadcastLong - 1) >>> 0;
                      }

                     solution.push({
                        index: i + 1,
                        name: `Sous-réseau ${i+1}`, 
                        hosts: 0, 
                        networkId: longToIp(networkIdLong),
                        broadcast: longToIp(broadcastLong), mask: cidrToMask(newCidr),
                        cidr: `/${newCidr}`, firstIp: longToIp(firstIpLong),
                        lastIp: longToIp(lastIpLong)
                     });
                     currentIpLong = (currentIpLong + subnetSize) >>> 0; 
                     if(currentIpLong === 0 && i < N -1 ) { 
                          return { solution: [], error: "Dépassement d'adresse IP." };
                     }
                }
                 return { solution, error: null };
            }

            function generateSolutionTable(solutionData, gatewayRule = 'première') { 
                if (!solutionData || !solutionData.solution || solutionData.solution.length === 0) {
                    return solutionData?.error ? `<p class="error"><strong>Erreur :</strong> ${solutionData.error}</p>` : `<p class="error">Aucune solution trouvée.</p>`;
                }
                let table = `<table class="solution-table"><thead><tr>
                                <th>Réseau</th><th>Hôtes Requis</th><th>ID Réseau</th>
                                <th>Masque (CIDR)</th><th>Passerelle</th>
                                <th>Plage Utilisable</th><th>Broadcast</th>
                                <th>Détails Calcul</th> 
                            </tr></thead><tbody>`;
                for (const net of solutionData.solution) {
                    let gateway = 'N/A'; let range = 'N/A';
                    const cidrVal = parseInt(net.cidr.substring(1));
                    if (cidrVal <= 30) { gateway = (gatewayRule === 'première') ? net.firstIp : net.lastIp; range = `${net.firstIp} - ${net.lastIp}`; } 
                    else if (cidrVal === 31) { gateway = net.firstIp; range = `${net.firstIp}, ${net.lastIp}`; } 
                    else { gateway = net.networkId; range = net.networkId; }
                    
                    table += `<tr>
                                <td><strong>${net.name}</strong></td> <td>${net.hosts}</td>
                                <td>${net.networkId}</td> <td>${net.mask} (${net.cidr})</td>
                                <td><strong>${gateway}</strong></td> <td>${range}</td>
                                <td>${net.broadcast}</td>
                                <td>${generateFormulaExplanation(net, 'hosts')}</td> 
                              </tr>`;
                }
                table += `</tbody></table>`;
                if (solutionData.error) {
                    table += `<p style="color: var(--error-text); margin-top: 10px;"><strong>Note :</strong> ${solutionData.error}</p>`;
                }
                return table;
            }


            // --- SECTION OUTILS : ÉCOUTEURS ET LOGIQUE ---
            
            const cidrInput = document.getElementById('cidrInput');
            const cidrCalcButton = document.getElementById('cidrCalcButton');
            const cidrResult = document.getElementById('cidrResult');
            function calculateCidrMask() { 
                 const cidrValue = parseInt(cidrInput.value, 10);
                cidrResult.classList.remove('error');
                const mask = cidrToMask(cidrValue);
                if (mask === null) {
                    cidrResult.textContent = 'Erreur : Veuillez entrer un nombre entre 0 et 32.';
                    cidrResult.classList.add('error');
                } else {
                    cidrResult.innerHTML = `CIDR <strong>/${cidrValue}</strong> = Masque <strong>${mask}</strong>`;
                }
                cidrResult.style.display = 'block';
            }
            if (cidrCalcButton) cidrCalcButton.addEventListener('click', calculateCidrMask);
            if (cidrInput) cidrInput.addEventListener('keyup', (e) => e.key === 'Enter' && calculateCidrMask());

            const hostsInput = document.getElementById('hostsInput');
            const hostsCalcButton = document.getElementById('hostsCalcButton');
            const hostsResult = document.getElementById('hostsResult');
            function calculateHostsToCidr() { 
                 const hosts = parseInt(hostsInput.value, 10);
                hostsResult.classList.remove('error');
                if (isNaN(hosts) || hosts < 0) {
                    hostsResult.textContent = 'Erreur : Veuillez entrer un nombre valide d\'hôtes.';
                    hostsResult.classList.add('error');
                } else {
                    const cidr = hostsToCidr(hosts);
                    const mask = cidrToMask(cidr);
                    let hostsFound = (cidr >= 30) ? 2 : (cidrToSize(cidr) - 2);
                    hostsResult.innerHTML = `<ul>
                        <li><strong>Hôtes valides :</strong> ${hostsFound}</li>
                        <li><strong>Masque CIDR :</strong> /${cidr}</li>
                        <li><strong>Masque Réseau :</strong> ${mask}</li>
                    </ul>`;
                }
                hostsResult.style.display = 'block';
            }
            if (hostsCalcButton) hostsCalcButton.addEventListener('click', calculateHostsToCidr);
            if (hostsInput) hostsInput.addEventListener('keyup', (e) => e.key === 'Enter' && calculateHostsToCidr());

            const maskInputWildcard = document.getElementById('maskInputWildcard');
            const wildcardCalcButton = document.getElementById('wildcardCalcButton');
            const wildcardResult = document.getElementById('wildcardResult');
            function calculateWildcard() { 
                const maskStr = maskInputWildcard.value;
                wildcardResult.classList.remove('error');
                const wildcardStr = maskToWildcard(maskStr); 
                if (wildcardStr === null) {
                    wildcardResult.textContent = 'Erreur : Masque de sous-réseau invalide.';
                    wildcardResult.classList.add('error');
                } else {
                    wildcardResult.innerHTML = `Masque Wildcard : <strong>${wildcardStr}</strong>`;
                }
                wildcardResult.style.display = 'block';
            }
            if (wildcardCalcButton) wildcardCalcButton.addEventListener('click', calculateWildcard);
            if (maskInputWildcard) maskInputWildcard.addEventListener('keyup', (e) => e.key === 'Enter' && calculateWildcard());
            
            const infoIpInput = document.getElementById('infoIpInput');
            const infoMaskInput = document.getElementById('infoMaskInput');
            const infoCalcButton = document.getElementById('infoCalcButton');
            const infoResult = document.getElementById('infoResult');
            function calculateNetworkInfo() { 
                 const ipStr = infoIpInput.value;
                const maskStr = infoMaskInput.value;
                infoResult.classList.remove('error');
                const ipLong = ipToLong(ipStr);
                const cidr = parseMask(maskStr);
                if (ipLong === null || cidr === null) {
                    infoResult.textContent = 'Erreur : IP ou masque/CIDR invalide.';
                    infoResult.classList.add('error');
                    infoResult.style.display = 'block';
                    return;
                }
                const maskLong = ipToLong(cidrToMask(cidr));
                const networkIdLong = (ipLong & maskLong) >>> 0;
                const broadcastLong = (networkIdLong | (~maskLong)) >>> 0;
                const wildcardLong = (~maskLong) >>> 0;
                let firstIpLong, lastIpLong, hostCount;
                if (cidr === 32) {
                    firstIpLong = networkIdLong; lastIpLong = networkIdLong; hostCount = 1;
                } else if (cidr >= 30) { 
                    firstIpLong = networkIdLong + 1; lastIpLong = broadcastLong - 1; hostCount = 2;
                     if(cidr === 31) { firstIpLong = networkIdLong; lastIpLong = broadcastLong; }
                } else {
                    firstIpLong = (networkIdLong + 1) >>> 0; lastIpLong = (broadcastLong - 1) >>> 0;
                    hostCount = (broadcastLong - firstIpLong + 1);
                }
                
                infoResult.innerHTML = `<ul>
                    <li><strong>ID Réseau :</strong> ${longToIp(networkIdLong)}</li>
                    <li><strong>Broadcast :</strong> ${longToIp(broadcastLong)}</li>
                    <li><strong>Masque :</strong> ${longToIp(maskLong)} (/${cidr})</li>
                    <li><strong>Wildcard :</strong> ${longToIp(wildcardLong)}</li>
                    <li><strong>Plage Hôtes :</strong> ${longToIp(firstIpLong)} - ${longToIp(lastIpLong)}</li>
                    <li><strong>Hôtes Valides :</strong> ${hostCount} ${cidr >= 30 ? `(${cidr === 31 ? 'RFC 3021' : '/30 link'})` : ''}</li>
                </ul>`;
                infoResult.style.display = 'block';
            }
            if (infoCalcButton) infoCalcButton.addEventListener('click', calculateNetworkInfo);
            if (infoIpInput) infoIpInput.addEventListener('keyup', (e) => e.key === 'Enter' && calculateNetworkInfo());
            if (infoMaskInput) infoMaskInput.addEventListener('keyup', (e) => e.key === 'Enter' && calculateNetworkInfo());

            const vlsmToolInputNetwork = document.getElementById('vlsmToolInputNetwork');
            const vlsmToolCalcButton = document.getElementById('vlsmToolCalcButton');
            const vlsmToolResult = document.getElementById('vlsmToolResult');
            function parseVLSMInput(text) { 
                 return text.split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0)
                    .map(line => {
                        const parts = line.split(/[:=,]/);
                        if (parts.length < 2) return null;
                        const name = parts[0].trim();
                        const hosts = parseInt(parts[1].trim(), 10);
                        return (name && !isNaN(hosts) && hosts >= 0) ? { name, hosts } : null;
                    })
                    .filter(item => item !== null)
                    .sort((a, b) => b.hosts - a.hosts);
            }

            function parseHostInputsForm(containerId) {
                const container = document.getElementById(containerId);
                if (!container) return [];
                const rows = container.querySelectorAll('.host-req-row');
                const requirements = [];
                rows.forEach(row => {
                    const name = row.querySelector('.host-req-name').value.trim();
                    const hostsVal = row.querySelector('.host-req-count').value;
                    const hosts = parseInt(hostsVal, 10);
                    if (name && !isNaN(hosts) && hosts > 0) {
                        requirements.push({ name, hosts });
                    }
                });
                return requirements.sort((a, b) => b.hosts - a.hosts);
            }

            function calculateManualVLSM() { 
                const networkStr = vlsmToolInputNetwork.value;
                vlsmToolResult.classList.remove('error');
                const networkParts = networkStr.split('/');
                if (networkParts.length !== 2) {
                    vlsmToolResult.innerHTML = '<span class="error">Erreur : Le réseau de base doit être au format IP/CIDR.</span>';
                    vlsmToolResult.classList.add('error'); vlsmToolResult.style.display = 'block'; return;
                }
                const baseCidr = parseInt(networkParts[1], 10);
                const subnets = parseHostInputsForm('vlsmToolInputHostsContainer');
                const inputIpLong = ipToLong(networkParts[0]);
                if (inputIpLong === null || isNaN(baseCidr) || subnets.length === 0) {
                    vlsmToolResult.innerHTML = '<span class="error">Erreur : Réseau de base ou liste d\'hôtes invalide.</span>';
                    vlsmToolResult.classList.add('error'); vlsmToolResult.style.display = 'block'; return;
                }
                const maskLong = ipToLong(cidrToMask(baseCidr));
                const baseIp = longToIp((inputIpLong & maskLong) >>> 0);
                const solutionData = calculateVLSM(baseIp, baseCidr, subnets);
                vlsmToolResult.innerHTML = generateSolutionTable(solutionData, 'première'); 
                vlsmToolResult.style.display = 'block';
            }
            if (vlsmToolCalcButton) vlsmToolCalcButton.addEventListener('click', calculateManualVLSM);


            // --- SECTION FAVORIS ---
            
            const SCENARIO_FAVORITES_KEY = 'networkScenarioFavorites';
            const ROUTING_FAVORITES_KEY = 'networkRoutingFavorites';
            const SEGMENTATION_FAVORITES_KEY = 'networkSegmentationFavorites'; 
            const SCENARIO_NOTEPAD_KEY = 'networkScenarioNotepads';
            const ROUTING_NOTEPAD_KEY = 'networkRoutingNotepads';
            const SEGMENTATION_NOTEPAD_KEY = 'networkSegmentationNotepads'; 
            
            let scenarioFavorites = [];
            let routingFavorites = [];
            let segmentationFavorites = []; 
            let scenarioNotepads = {};
            let routingNotepads = {};
            let segmentationNotepads = {}; 
            
            const favoritesListScenarios = document.getElementById('favoritesListScenarios');
            const favoritesListRouting = document.getElementById('favoritesListRouting');
            const favoritesListSegmentation = document.getElementById('favoritesListSegmentation'); 
            
            function loadFavorites() { 
                 scenarioFavorites = JSON.parse(localStorage.getItem(SCENARIO_FAVORITES_KEY) || '[]');
                 routingFavorites = JSON.parse(localStorage.getItem(ROUTING_FAVORITES_KEY) || '[]');
                 segmentationFavorites = JSON.parse(localStorage.getItem(SEGMENTATION_FAVORITES_KEY) || '[]'); 
                 
                 scenarioNotepads = JSON.parse(localStorage.getItem(SCENARIO_NOTEPAD_KEY) || '{}');
                 routingNotepads = JSON.parse(localStorage.getItem(ROUTING_NOTEPAD_KEY) || '{}');
                 segmentationNotepads = JSON.parse(localStorage.getItem(SEGMENTATION_NOTEPAD_KEY) || '{}'); 
            }

            function saveFavorites(type) { 
                 if (type === 'scenario') localStorage.setItem(SCENARIO_FAVORITES_KEY, JSON.stringify(scenarioFavorites));
                 else if (type === 'routing') localStorage.setItem(ROUTING_FAVORITES_KEY, JSON.stringify(routingFavorites));
                 else if (type === 'segmentation') localStorage.setItem(SEGMENTATION_FAVORITES_KEY, JSON.stringify(segmentationFavorites)); 
            }
            
            function saveNotepad(type) {
                if (type === 'scenario') localStorage.setItem(SCENARIO_NOTEPAD_KEY, JSON.stringify(scenarioNotepads));
                else if (type === 'routing') localStorage.setItem(ROUTING_NOTEPAD_KEY, JSON.stringify(routingNotepads));
                else if (type === 'segmentation') localStorage.setItem(SEGMENTATION_NOTEPAD_KEY, JSON.stringify(segmentationNotepads));
            }

            function isFavorite(item, type) { 
                 if (!item || !item.id) return false;
                 let list;
                 if (type === 'scenario') list = scenarioFavorites;
                 else if (type === 'routing') list = routingFavorites;
                 else if (type === 'segmentation') list = segmentationFavorites; 
                 else return false;
                 return list.some(fav => fav.id === item.id);
            }

            function toggleFavorite(type) { 
                 let item; let list; let starIconId;

                 if (type === 'scenario') { item = currentScenario; list = scenarioFavorites; starIconId = 'saveFavoriteBtn'; } 
                 else if (type === 'routing') { item = currentRoutingExercise; list = routingFavorites; starIconId = 'saveRoutingFavoriteBtn'; } 
                 else if (type === 'segmentation') { item = currentSegmentationExercise; list = segmentationFavorites; starIconId = 'saveSegmentationFavoriteBtn'; } 
                 else { return; }
                 
                if (!item) return;
                if (!item.id) item.id = Date.now();
                
                const starIcon = document.getElementById(starIconId);
                
                if (isFavorite(item, type)) {
                    // Retirer
                    const index = list.findIndex(fav => fav.id === item.id);
                    if (index > -1) list.splice(index, 1);
                    if (starIcon) { starIcon.textContent = '☆'; starIcon.classList.remove('is-favorite'); }
                } else {
                    // Ajouter
                    const itemCopy = JSON.parse(JSON.stringify(item)); 
                    list.push(itemCopy);
                    if (starIcon) { starIcon.textContent = '★'; starIcon.classList.add('is-favorite'); }
                }
                saveFavorites(type);
            }
            
            const exportFavoritesButton = document.getElementById('exportFavoritesButton');
            const importFavoritesInput = document.getElementById('importFavoritesInput');
            
            exportFavoritesButton.addEventListener('click', () => {
                const allData = {
                    scenarioFavorites,
                    routingFavorites,
                    segmentationFavorites,
                    scenarioNotepads,
                    routingNotepads,
                    segmentationNotepads
                };
                const dataStr = JSON.stringify(allData, null, 2);
                const dataBlob = new Blob([dataStr], {type: 'application/json'});
                const url = URL.createObjectURL(dataBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `favoris_outils_reseau_${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });

            document.getElementById('closeGlobalModal')?.addEventListener('click', () => {
                document.getElementById('globalModal').style.display = 'none';
            });
            document.getElementById('globalModal')?.addEventListener('click', (e) => {
                if (e.target === document.getElementById('globalModal')) document.getElementById('globalModal').style.display = 'none';
            });
            
            importFavoritesInput.addEventListener('change', (event) => {
                const file = event.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        if (confirm("Voulez-vous remplacer vos favoris et bloc-notes actuels par ceux du fichier ?")) {
                            scenarioFavorites = data.scenarioFavorites || [];
                            routingFavorites = data.routingFavorites || [];
                            segmentationFavorites = data.segmentationFavorites || [];
                            scenarioNotepads = data.scenarioNotepads || {};
                            routingNotepads = data.routingNotepads || {};
                            segmentationNotepads = data.segmentationNotepads || {};
                            
                            saveFavorites('scenario');
                            saveFavorites('routing');
                            saveFavorites('segmentation');
                            saveNotepad('scenario');
                            saveNotepad('routing');
                            saveNotepad('segmentation');
                            
                            renderFavoritesList();
                            alert("Importation réussie !");
                        }
                    } catch (err) {
                        alert("Erreur lors de la lecture du fichier. Le fichier est peut-être corrompu.");
                        console.error(err);
                    }
                };
                reader.readAsText(file);
                event.target.value = null; 
            });


            function renderFavoritesList() { 
                favoritesListScenarios.innerHTML = '';
                if (scenarioFavorites.length === 0) favoritesListScenarios.innerHTML = '<p>Aucun scénario sauvegardé.</p>';
                else {
                    scenarioFavorites.forEach((scenario) => {
                        const item = document.createElement('div');
                        item.className = 'favorite-item';
                        item.innerHTML = `<div><span class="favorite-item-title">${scenario.title}</span></div>
                                          <div class="favorite-item-actions">
                                            <button class="btn-load-fav" data-id="${scenario.id}" data-type="scenario">Charger</button>
                                            <button class="btn-delete-fav" data-id="${scenario.id}" data-type="scenario">Supprimer</button>
                                          </div>`;
                        favoritesListScenarios.appendChild(item);
                    });
                }
                favoritesListRouting.innerHTML = '';
                if (routingFavorites.length === 0) favoritesListRouting.innerHTML = '<p>Aucun exercice de routage sauvegardé.</p>';
                else {
                    routingFavorites.forEach((exercise) => {
                        const item = document.createElement('div');
                        item.className = 'favorite-item';
                        item.innerHTML = `<div><span class="favorite-item-title">${exercise.title}</span></div>
                                          <div class="favorite-item-actions">
                                            <button class="btn-load-fav" data-id="${exercise.id}" data-type="routing">Charger</button>
                                            <button class="btn-delete-fav" data-id="${exercise.id}" data-type="routing">Supprimer</button>
                                          </div>`;
                        favoritesListRouting.appendChild(item);
                    });
                }
                favoritesListSegmentation.innerHTML = '';
                if (segmentationFavorites.length === 0) favoritesListSegmentation.innerHTML = '<p>Aucun exercice de segmentation sauvegardé.</p>';
                else {
                    segmentationFavorites.forEach((exercise) => {
                        const item = document.createElement('div');
                        item.className = 'favorite-item';
                        item.innerHTML = `<div><span class="favorite-item-title">${exercise.title}</span></div>
                                          <div class="favorite-item-actions">
                                            <button class="btn-load-fav" data-id="${exercise.id}" data-type="segmentation">Charger</button>
                                            <button class="btn-delete-fav" data-id="${exercise.id}" data-type="segmentation">Supprimer</button>
                                          </div>`;
                        favoritesListSegmentation.appendChild(item);
                    });
                }
            }
            [favoritesListScenarios, favoritesListRouting, favoritesListSegmentation].forEach(list => { 
                if (!list) return;
                list.addEventListener('click', (e) => {
                    const target = e.target;
                    const itemId = target.dataset.id ? parseInt(target.dataset.id, 10) : null;
                    const type = target.dataset.type;
                    if (!itemId || !type) return;

                    let listSource; let displayFunction; let targetTab;

                    if (type === 'scenario') { listSource = scenarioFavorites; displayFunction = displayScenario; targetTab = 'generator'; } 
                    else if (type === 'routing') { listSource = routingFavorites; displayFunction = displayRoutingExercise; targetTab = 'routing'; } 
                    else if (type === 'segmentation') { listSource = segmentationFavorites; displayFunction = displaySegmentationExercise; targetTab = 'segmentation'; } 
                    else { return; }
                    
                    if (target.classList.contains('btn-load-fav')) {
                        const itemToLoad = JSON.parse(JSON.stringify(listSource.find(fav => fav.id === itemId))); 
                        if (itemToLoad) {
                            if (type === 'scenario') {
                                currentScenario = itemToLoad;
                                currentDifficulty = itemToLoad.difficulty; currentGatewayRule = itemToLoad.gatewayRule;
                                currentSolutionData = calculateVLSM(itemToLoad.baseNetwork.address, itemToLoad.baseNetwork.cidr, itemToLoad.subnets);
                                currentClassicSolutionData = (currentDifficulty === 'Facile') ? calculateClassicSubnetting(itemToLoad.baseNetwork.address, itemToLoad.baseNetwork.cidr, itemToLoad.subnets) : null;
                                displayFunction(itemToLoad, false); 
                            } else if (type === 'routing') {
                                currentRoutingExercise = itemToLoad;
                                displayFunction(itemToLoad); 
                            } else if (type === 'segmentation') {
                                     currentSegmentationExercise = itemToLoad;
                                     if(itemToLoad.subType === 'network') {
                                         currentSegmentationSolution = calculateSegmentationByNetworkSolution(itemToLoad.baseIp, itemToLoad.baseCidr, itemToLoad.N);
                                     } else {
                                         currentSegmentationSolution = calculateVLSM(itemToLoad.baseIp, itemToLoad.baseCidr, itemToLoad.requirements);
                                     }
                                     displayFunction(itemToLoad);
                                     segmentationSolutionContainerEl.style.display = 'none'; segmentationSolutionContainerEl.innerHTML = '';
                                     btnShowSegmentationSolution.style.display = 'inline-block'; 
                                     btnCheckSegmentationSolution.style.display = 'inline-block';
                            }
                            
                            document.querySelector(`.tab-button[data-tab="${targetTab}"]`).click();
                        }
                    }
                    
                    if (target.classList.contains('btn-delete-fav')) {
                        if (confirm(`Voulez-vous vraiment supprimer "${listSource.find(fav => fav.id === itemId).title}" ?`)) {
                            const index = listSource.findIndex(fav => fav.id === itemId);
                            if (index > -1) listSource.splice(index, 1);
                            saveFavorites(type);
                            if (type === 'scenario') delete scenarioNotepads[itemId]; saveNotepad('scenario');
                            if (type === 'routing') delete routingNotepads[itemId]; saveNotepad('routing');
                            if (type === 'segmentation') delete segmentationNotepads[itemId]; saveNotepad('segmentation');
                            renderFavoritesList(); 
                        }
                    }
                });
            });


            // --- SECTION GÉNÉRATEUR DE SCÉNARIO (VLSM) ---
            
            const btnEasy = document.getElementById('btnEasy');
            const btnMedium = document.getElementById('btnMedium');
            const btnHard = document.getElementById('btnHard');
            const btnCustom = document.getElementById('btnCustom');
            const formCustom = document.getElementById('formCustom');
            
            const outputDiv = document.getElementById('scenarioOutput');
            const solutionContainer = document.getElementById('solutionContainer');
            const customControlsContainer = document.getElementById('customControlsContainer');
            const scenarioNotepadContainer = document.getElementById('scenarioNotepadContainer');

            let currentScenario = null;
            let currentSolutionData = null;
            let currentClassicSolutionData = null;
            let currentGatewayRule = 'première';
            let currentDifficulty = '';

            btnEasy.addEventListener('click', () => generateScenario('Facile'));
            btnMedium.addEventListener('click', () => generateScenario('Moyen'));
            btnHard.addEventListener('click', () => generateScenario('Difficile'));
            
            btnCustom.addEventListener('click', () => { 
                 customControlsContainer.style.display = 'block';
                 outputDiv.style.display = 'none';
                 solutionContainer.style.display = 'none';
                 scenarioNotepadContainer.style.display = 'none';
            });
            
            formCustom.addEventListener('submit', (e) => { 
                e.preventDefault();
                generateCustomScenario();
            });

            function displaySolution() { 
                 if (!currentSolutionData) return;
            let solutionHTML = '';
                if (currentDifficulty === 'Facile' && currentClassicSolutionData && currentClassicSolutionData.solution.length > 0) {
                    solutionHTML += `<h3>Solution Classique (Sans VLSM)</h3><p>Un seul masque (/${currentClassicSolutionData.solution[0].cidr.substring(1)}) appliqué.</p>`;
                    solutionHTML += generateSolutionTable(currentClassicSolutionData, currentGatewayRule);
                    solutionHTML += `<h3 style="margin-top: 25px;">Solution Optimisée (Avec VLSM)</h3><p>Un masque adapté à chaque besoin.</p>`;
                    solutionHTML += generateSolutionTable(currentSolutionData, currentGatewayRule);
                } else {
                    solutionHTML += `<h2>Plan d'Adressage (Solution)</h2><p>Voici un plan VLSM possible.</p>`;
                    solutionHTML += generateSolutionTable(currentSolutionData, currentGatewayRule); 
                }
                solutionHTML += `<button id="btnGenerateIOS">Générer Config IOS</button>`;
                
                solutionContainer.innerHTML = solutionHTML;
                solutionContainer.style.display = 'block';
                
                const btnGenIOS = document.getElementById('btnGenerateIOS');
                if (btnGenIOS) btnGenIOS.onclick = showIOSConfigModal;
            }

            function getRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
            function getRandomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

            // MODIFICATION : AJOUT DES MASQUES VARIÉS (/13, /17, /26)
            function getRandomBaseNetwork(difficulty) { 
                const classCNetworks = [
                    { address: `192.168.${getRandomInt(0, 255)}.0`, cidr: 24, class: 'C' },
                    { address: `192.168.${getRandomInt(0, 255)}.0`, cidr: 25, class: 'C' }, 
                    { address: `192.168.${getRandomInt(0, 255)}.0`, cidr: 26, class: 'C' }, // AJOUT /26
                    { address: `192.168.${getRandomInt(0, 255)}.0`, cidr: 27, class: 'C' }, 
                ];
                const classBNetworks = [
                    { address: `172.${getRandomInt(16, 31)}.0.0`, cidr: 16, class: 'B' },
                    { address: `172.${getRandomInt(16, 31)}.${getRandomInt(0,255)}.0`, cidr: 20, class: 'B' }, 
                    { address: `172.${getRandomInt(16, 31)}.0.0`, cidr: 17, class: 'B' }, // AJOUT /17
                    { address: `172.${getRandomInt(16, 31)}.${getRandomInt(0,255)}.0`, cidr: 22, class: 'B' }, 
                     { address: `172.${getRandomInt(16, 31)}.${getRandomInt(0,255)}.0`, cidr: 23, class: 'B' }, 
                ];
                 const classANetworks = [
                    { address: `10.${getRandomInt(0, 255)}.0.0`, cidr: 16, class: 'A' }, 
                     { address: `10.${getRandomInt(0, 255)}.${getRandomInt(0,255)}.0`, cidr: 20, class: 'A' }, 
                     { address: `10.${getRandomInt(0, 255)}.${getRandomInt(0,255)}.0`, cidr: 18, class: 'A' }, 
                     { address: `10.${getRandomInt(0, 255)}.0.0`, cidr: 13, class: 'A' }, // AJOUT /13
                ];

                if (difficulty === 'Facile') return classCNetworks[0]; 
                if (difficulty === 'Moyen') return getRandom([classCNetworks[0], classCNetworks[1], classCNetworks[2], classBNetworks[0]]); 
                return getRandom([...classCNetworks, ...classBNetworks, ...classANetworks]); 
            }
            function getSubnetRequirements(difficulty) { 
                const allDepts = ['Ventes', 'Compta', 'Admin', 'RH', 'IT', 'Serveurs', 'Marketing', 'Invités', 'Direction', 'Logistique'];
                const shuffledDepts = [...allDepts].sort(() => 0.5 - Math.random()); const requirements = []; let numSubnets;
                if (difficulty === 'Facile') { numSubnets = getRandomInt(2, 3); const hostCount = getRandom([20, 25, 30]); for (let i = 0; i < numSubnets; i++) requirements.push({ name: shuffledDepts[i], hosts: hostCount }); } 
                else if (difficulty === 'Moyen') { numSubnets = getRandomInt(4, 5); const hosts = [120, 50, 25, 10, 5].sort(() => 0.5 - Math.random()); for (let i = 0; i < numSubnets; i++) requirements.push({ name: shuffledDepts[i], hosts: hosts[i] || 2 }); } 
                else { numSubnets = getRandomInt(5, 6); const hosts = [250, 110, 60, 28, 12, 2].sort(() => 0.5 - Math.random()); for (let i = 0; i < numSubnets; i++) requirements.push({ name: shuffledDepts[i], hosts: hosts[i] || 2 }); }
                return requirements.sort((a, b) => b.hosts - a.hosts);
            }
            function getConstraints(difficulty, subnets) { 
                currentGatewayRule = getRandom(['première', 'dernière']);
                let constraints = [`Passerelle = ${currentGatewayRule === 'première' ? '**première**' : '**dernière**'} IP utilisable.`];
                if (difficulty === 'Facile') { constraints.push("Un seul routeur."); constraints.push("VLSM non nécessaire."); } 
                else if (difficulty === 'Moyen') { constraints.push("**VLSM** requis."); constraints.push("Routage **statique**."); } 
                else { const serverDept = subnets.find(s => s.name === 'Serveurs') || subnets[0]; const guestDept = subnets.find(s => s.name === 'Invités') || subnets[subnets.length - 1] || subnets[1]; constraints.push("**VLSM** requis."); constraints.push(`Routage dynamique **${getRandom(['RIPv2', 'OSPF'])}**.`); constraints.push(`**ACL standard** interdisant ${guestDept.name} -> ${serverDept.name}.`); }
                return constraints;
            }
            function getServices(difficulty, subnets) { 
                let services = []; const dhcpTarget = getRandom(subnets.filter(s => s.hosts > 5)); const serverTarget = subnets.find(s => s.name === 'Serveurs') || subnets[0];
                if (difficulty === 'Facile') services.push("IP **statique**."); 
                else if (difficulty === 'Moyen') { services.push(`**DHCP** (sur routeur) pour ${ (dhcpTarget || subnets[0]).name}.`); services.push("Autres en IP statique."); } 
                else { services.push(`Serveur **DHCP** dédié pour ${(dhcpTarget || subnets[0]).name}.`); services.push(`Réseau ${serverTarget.name} héberge **WEB** et **DNS**.`); services.push(`DNS résoud "www.scenario.local".`); }
                return services;
            }
            function getObjective(difficulty, subnets) { 
                 if (subnets.length < 2) return "Connectivité."; let [sub1, sub2] = [getRandom(subnets), getRandom(subnets)]; while (sub1.name === sub2.name) sub2 = getRandom(subnets); let objective = `PC (${sub1.name}) ping PC (${sub2.name}).`;
                 if (difficulty === 'Difficile') { const serverTarget = subnets.find(s => s.name === 'Serveurs') || subnets[0]; const clientTarget = subnets.find(s => s.name !== serverTarget.name) || subnets[1]; objective += ` PC (${clientTarget.name}) accède "www.scenario.local".` } return objective;
            }
            
            function generateCustomScenario() { 
                 const networkStr = document.getElementById('customBaseNetwork').value; const networkParts = networkStr.split('/');
                 if (networkParts.length !== 2 || ipToLong(networkParts[0]) === null || parseMask(`/${networkParts[1]}`) === null) { alert("Erreur : Réseau de base invalide."); return; }
                 const inputIpLong = ipToLong(networkParts[0]);
                 const cidr = parseInt(networkParts[1], 10);
                 const maskLong = ipToLong(cidrToMask(cidr));
                 const baseIp = longToIp((inputIpLong & maskLong) >>> 0);
                 const baseNetwork = { address: baseIp, cidr: cidr }; const subnets = parseHostInputsForm('customScenarioHostsContainer'); if (subnets.length === 0) { alert("Erreur : Veuillez remplir au moins un besoin en hôte."); return; }
                 currentGatewayRule = getRandom(['première', 'dernière']); let constraints = [`Passerelle = ${currentGatewayRule === 'première' ? '**première**' : '**dernière**'} IP.`, "**VLSM** requis."]; let services = [];
                 const useRIP = document.getElementById('customRoutingRIP').checked; const useOSPF = document.getElementById('customRoutingOSPF').checked; if (useRIP) constraints.push("Routage **RIPv2**."); if (useOSPF) constraints.push("Routage **OSPF**."); if (!useRIP && !useOSPF) constraints.push("Routage **statique**."); if (document.getElementById('customACL').checked && subnets.length >= 2) constraints.push(`**ACL** interdisant ${subnets[subnets.length - 1].name} -> ${subnets[0].name}.`);
                 if (document.getElementById('customDHCP').checked) services.push(`**DHCP** for ${subnets[0].name}.`); if (document.getElementById('customDNS').checked) services.push("**DNS**."); if (document.getElementById('customWEB').checked) services.push("**WEB** (HTTP).");
                 let objective = (subnets.length >= 2) ? `PC (${subnets[0].name}) ping PC (${subnets[1].name}).` : "Connectivité.";
                 const scenarioData = { id: Date.now(), title: 'Mission (Personnalisée)', difficulty: 'Personnalisé', baseNetwork, subnets, constraints, services, objective, gatewayRule: currentGatewayRule };
                 displayScenario(scenarioData, true); customControlsContainer.style.display = 'none'; outputDiv.style.display = 'block';
            }
            
            function generateScenario(difficulty) { 
                const baseNetwork = getRandomBaseNetwork(difficulty); const subnets = getSubnetRequirements(difficulty); const constraints = getConstraints(difficulty, subnets); const services = getServices(difficulty, subnets); const objective = getObjective(difficulty, subnets);
                const scenarioData = { id: Date.now(), title: `Mission (Niveau: ${difficulty})`, difficulty, baseNetwork, subnets, constraints, services, objective, gatewayRule: currentGatewayRule };
                displayScenario(scenarioData, true); customControlsContainer.style.display = 'none'; outputDiv.style.display = 'block';
            }

            function displayScenario(scenarioData, recalcSolutions = true) { 
                 solutionContainer.style.display = 'none'; solutionContainer.innerHTML = ''; currentScenario = scenarioData; currentDifficulty = scenarioData.difficulty; currentGatewayRule = scenarioData.gatewayRule;
                 localStorage.setItem('activeScenario', JSON.stringify(scenarioData));
                 if (recalcSolutions) { currentSolutionData = calculateVLSM(scenarioData.baseNetwork.address, scenarioData.baseNetwork.cidr, scenarioData.subnets); currentClassicSolutionData = (scenarioData.difficulty === 'Facile') ? calculateClassicSubnetting(scenarioData.baseNetwork.address, scenarioData.baseNetwork.cidr, scenarioData.subnets) : null; }
                 const isFav = isFavorite(currentScenario, 'scenario'); const starIcon = isFav ? '★' : '☆'; const starClass = isFav ? 'is-favorite' : '';
                 let html = `<div class="scenario-title"><h2>${scenarioData.title}</h2><span id="saveFavoriteBtn" class="favorite-star ${starClass}" title="Ajouter/Retirer des favoris">${starIcon}</span></div>`;
                 
                 html += `<div class="scenario-columns">`;
                 html += `<div class="scenario-col">`;
                 html += `<h3>1. Contexte</h3><p>Bloc d'adresse : <strong>${scenarioData.baseNetwork.address}/${scenarioData.baseNetwork.cidr}</strong>.</p><h3>2. Besoins</h3><ul>`;
                 scenarioData.subnets.forEach(s => { html += `<li><strong>${s.name} :</strong> ${s.hosts} hôtes</li>`; }); html += `</ul>`;
                 html += `<h3>3. Contraintes</h3><ul>`;
                 scenarioData.constraints.forEach(c => { html += `<li>${c}</li>`; }); html += `</ul></div>`;
                 html += `<div class="scenario-col">`;
                 html += `<h3>4. Services</h3><ul>`;
                 scenarioData.services.forEach(s => { html += `<li>${s}</li>`; }); html += `</ul><h3>5. Objectif</h3><p>${scenarioData.objective}</p></div></div>`;
                 
                 html += `<div style="text-align: center; margin-top: 30px;"><p><strong>À vous de jouer !</strong></p><button id="btnSolution">Afficher la solution</button></div>`;
                 outputDiv.innerHTML = html; outputDiv.style.display = 'block';
                 
                 scenarioNotepadContainer.style.display = 'block';
                 const notes = scenarioNotepads[currentScenario.id] || "";
                 document.getElementById('scenarioNotepad').value = notes;
                 document.getElementById('scenarioNotepadStatus').textContent = "";
                 
                 const btnSol = document.getElementById('btnSolution');
                 if (btnSol) btnSol.onclick = displaySolution;
                 const saveFavBtn = document.getElementById('saveFavoriteBtn');
                 if (saveFavBtn) saveFavBtn.onclick = () => toggleFavorite('scenario');
            }
            
            // --- LOGIQUE MODAL IOS ---
            const iosConfigModal = document.getElementById('iosConfigModal');
            const closeConfigModal = document.getElementById('closeConfigModal');
            const iosConfigOutput = document.getElementById('iosConfigOutput');
            
            closeConfigModal.addEventListener('click', () => iosConfigModal.style.display = 'none');
            iosConfigModal.addEventListener('click', (e) => { 
                if (e.target === iosConfigModal) iosConfigModal.style.display = 'none'; 
            });
            
            function showIOSConfigModal() {
                iosConfigOutput.textContent = "Génération de la configuration...";
                iosConfigModal.style.display = 'flex';
                const config = generateIOSConfig(currentScenario, currentSolutionData, currentGatewayRule);
                iosConfigOutput.textContent = config;
            }
            
            function generateIOSConfig(scenario, solutionData, gatewayRule) {
                if (!scenario || !solutionData || !solutionData.solution) return "Erreur: Données du scénario introuvables.";
                
                let config = `! Configuration basée sur le scénario: ${scenario.title}\n`;
                config += `! Règle de passerelle: ${gatewayRule} IP\n`;
                
                const isMultiRouter = scenario.difficulty === 'Difficile' || scenario.constraints.some(c => c.includes('OSPF') || c.includes('RIP'));
                const numRouters = isMultiRouter ? 2 : 1;
                const networks = solutionData.solution;
                
                let r1Networks, r2Networks, linkNetwork;
                if (isMultiRouter) {
                    linkNetwork = networks[networks.length - 1]; 
                    const lanNetworks = networks.slice(0, -1);
                    const splitPoint = Math.ceil(lanNetworks.length / 2);
                    r1Networks = lanNetworks.slice(0, splitPoint);
                    r2Networks = lanNetworks.slice(splitPoint);
                } else {
                    r1Networks = networks;
                    r2Networks = [];
                }
                
                config += `\n! =====================================\n! CONFIGURATION ROUTEUR 1 (R1)\n! =====================================\n`;
                config += `enable\nconf t\nhostname R1\nno ip domain-lookup\n!\n`;
                
                let intfIndex = 0;
                for (const net of r1Networks) {
                    const gateway = (gatewayRule === 'première') ? net.firstIp : net.lastIp;
                    config += `interface FastEthernet0/${intfIndex}\n`;
                    config += ` description ${net.name}\n`;
                    config += ` ip address ${gateway} ${net.mask}\n`;
                    config += ` no shutdown\n!\n`;
                    intfIndex++;
                }
                
                if (isMultiRouter && linkNetwork) {
                    config += `interface FastEthernet0/${intfIndex}\n`;
                    config += ` description Liaison vers R2\n`;
                    config += ` ip address ${linkNetwork.firstIp} ${linkNetwork.mask}\n`;
                    config += ` no shutdown\n!\n`;
                }
                
                if (isMultiRouter) {
                    const routingConstraint = scenario.constraints.find(c => c.includes('Routage')) || "Routage statique";
                    if (routingConstraint.includes('RIP')) {
                        config += `router rip\n version 2\n no auto-summary\n`;
                        r1Networks.forEach(n => config += ` network ${n.networkId}\n`);
                        config += ` network ${linkNetwork.networkId}\n!\n`;
                    } else if (routingConstraint.includes('OSPF')) {
                        config += `router ospf 1\n`;
                        r1Networks.forEach(n => config += ` network ${n.networkId} ${maskToWildcard(n.mask)} area 0\n`);
                        config += ` network ${linkNetwork.networkId} ${maskToWildcard(linkNetwork.mask)} area 0\n!\n`;
                    } else { 
                        config += `! Routes statiques vers les réseaux de R2\n`;
                        const nextHop = linkNetwork.lastIp; 
                        r2Networks.forEach(n => config += `ip route ${n.networkId} ${n.mask} ${nextHop}\n`);
                        config += `!\n`;
                    }
                }
                
                const dhcpConstraint = scenario.services.find(s => s.includes('DHCP'));
                if (dhcpConstraint) {
                    const targetName = dhcpConstraint.split('pour ')[1]?.replace('.', '');
                    const dhcpNet = r1Networks.find(n => n.name === targetName);
                    if (dhcpNet) {
                        const gateway = (gatewayRule === 'première') ? dhcpNet.firstIp : dhcpNet.lastIp;
                        config += `! Configuration DHCP pour ${dhcpNet.name}\n`;
                        config += `ip dhcp excluded-address ${gateway}\n`;
                        config += `ip dhcp pool POOL_${dhcpNet.name.toUpperCase()}\n`;
                        config += ` network ${dhcpNet.networkId} ${dhcpNet.mask}\n`;
                        config += ` default-router ${gateway}\n`;
                        if (scenario.services.some(s => s.includes('DNS'))) {
                            const serverNet = networks.find(n => n.name === 'Serveurs') || networks[0];
                            const dnsServerIp = (gatewayRule === 'première') ? serverNet.firstIp : serverNet.lastIp;
                            config += ` dns-server ${dnsServerIp}\n`; 
                        }
                        config += `!\n`;
                    }
                }
                
                const aclConstraint = scenario.constraints.find(s => s.includes('ACL'));
                if (aclConstraint && r1Networks.length > 1) {
                    const parts = aclConstraint.match(/interdisant (.*) -> (.*)\./);
                    if (parts) {
                        const srcName = parts[1]; const dstName = parts[2];
                        const srcNet = networks.find(n => n.name === srcName);
                        const dstNet = networks.find(n => n.name === dstName);
                        const aclInterfaceNet = r1Networks.find(n => n.name === srcName); 
                        
                        if (srcNet && dstNet && aclInterfaceNet) {
                             config += `! Configuration ACL\n`;
                             config += `access-list 1 deny   ${srcNet.networkId} ${maskToWildcard(srcNet.mask)}\n`; 
                             config += `access-list 1 permit any\n!\n`;
                             const aclIntfIndex = r1Networks.indexOf(aclInterfaceNet);
                             config += `interface FastEthernet0/${aclIntfIndex}\n`;
                             config += ` ip access-group 1 in\n!\n`;
                        }
                    }
                }

                if (isMultiRouter) {
                    config += `\n! =====================================\n! CONFIGURATION ROUTEUR 2 (R2)\n! =====================================\n`;
                    config += `enable\nconf t\nhostname R2\nno ip domain-lookup\n!\n`;
                    
                    intfIndex = 0;
                    for (const net of r2Networks) {
                        const gateway = (gatewayRule === 'première') ? net.firstIp : net.lastIp;
                        config += `interface FastEthernet0/${intfIndex}\n`;
                        config += ` description ${net.name}\n`;
                        config += ` ip address ${gateway} ${net.mask}\n`;
                        config += ` no shutdown\n!\n`;
                        intfIndex++;
                    }
                    
                    config += `interface FastEthernet0/${intfIndex}\n`;
                    config += ` description Liaison vers R1\n`;
                    config += ` ip address ${linkNetwork.lastIp} ${linkNetwork.mask}\n`;
                    config += ` no shutdown\n!\n`;
                    
                    const routingConstraint = scenario.constraints.find(c => c.includes('Routage')) || "Routage statique";
                    if (routingConstraint.includes('RIP')) {
                        config += `router rip\n version 2\n no auto-summary\n`;
                        r2Networks.forEach(n => config += ` network ${n.networkId}\n`);
                        config += ` network ${linkNetwork.networkId}\n!\n`;
                    } else if (routingConstraint.includes('OSPF')) {
                        config += `router ospf 1\n`;
                        r2Networks.forEach(n => config += ` network ${n.networkId} ${maskToWildcard(n.mask)} area 0\n`);
                        config += ` network ${linkNetwork.networkId} ${maskToWildcard(linkNetwork.mask)} area 0\n!\n`;
                    } else { 
                        config += `! Routes statiques vers les réseaux de R1\n`;
                        const nextHop = linkNetwork.firstIp; 
                        r1Networks.forEach(n => config += `ip route ${n.networkId} ${n.mask} ${nextHop}\n`);
                        config += `!\n`;
                    }
                }
                
                config += `end\nwr\n`;
                return config;
            }

            
            
            // --- SECTION GÉNÉRATEUR DE ROUTAGE ---
            
            const btnGenerateRoutingEasy = document.getElementById('btnGenerateRoutingEasy');
            const btnGenerateRoutingMedium = document.getElementById('btnGenerateRoutingMedium');
            const btnGenerateRoutingHard = document.getElementById('btnGenerateRoutingHard');
            const btnGenerateRoutingCustomToggle = document.getElementById('btnGenerateRoutingCustomToggle');
            const customRoutingControls = document.getElementById('customRoutingControls');
            const customRouterCountInput = document.getElementById('customRouterCount');
            const btnGenerateRoutingCustomDo = document.getElementById('btnGenerateRoutingCustomDo');
            
            const routingExerciseOutput = document.getElementById('routingExerciseOutput');
            const routingNotepadContainer = document.getElementById('routingNotepadContainer');
            
            let currentRoutingExercise = null;
            
            const topologyGenerators = {
                linear: createLinearTopology,
                star: createStarTopology,
            };

            btnGenerateRoutingEasy.addEventListener('click', () => generateRoutingExercise(2, 'linear'));
            btnGenerateRoutingMedium.addEventListener('click', () => generateRoutingExercise(3, getRandom(['linear', 'star'])));
            btnGenerateRoutingHard.addEventListener('click', () => generateRoutingExercise(4, getRandom(['linear', 'star'])));
            
            btnGenerateRoutingCustomToggle.addEventListener('click', () => { 
                const isVisible = customRoutingControls.style.display === 'flex'; customRoutingControls.style.display = isVisible ? 'none' : 'flex'; 
            });
            
            btnGenerateRoutingCustomDo.addEventListener('click', () => { 
                const count = parseInt(customRouterCountInput.value, 10);
                if (count >= 2 && count <= 8) { 
                    const type = (count < 3) ? 'linear' : getRandom(['linear', 'star']);
                    generateRoutingExercise(count, type); 
                    customRoutingControls.style.display = 'none'; 
                } 
                else alert("Veuillez entrer un nombre de routeurs entre 2 et 8.");
            });
            
            function generateRoutingExercise(numRouters, type = 'linear') { 
                 const generator = topologyGenerators[type] || createLinearTopology;
                 const topology = generator(numRouters);
                 
                 if (!topology) { routingExerciseOutput.innerHTML = `<p class="error">Impossible de générer une topologie valide. Essayez à nouveau.</p>`; routingNotepadContainer.style.display = 'none'; return; }
                 
                 const tables = calculateAllRoutingTables(topology);
                 const exerciseData = { id: Date.now(), title: `Exercice Routage (${numRouters} Routeurs - ${type})`, type: 'routing', tables, topology };
                 currentRoutingExercise = exerciseData; 
                 displayRoutingExercise(exerciseData);
            }
            
            // --- Générateurs de Topologie ---
            
            function getAvailableIpSpace() {
                const lanBaseChoices = [ `192.168.${getRandomInt(0, 254)}.0`, `172.${getRandomInt(16, 30)}.${getRandomInt(0,254)}.0`, `10.${getRandomInt(1, 254)}.${getRandomInt(1, 254)}.0` ];
                const linkBaseChoices = [ `10.${getRandomInt(1, 254)}.${getRandomInt(1, 254)}.${getRandomInt(0,254) & 0xFC}`, `172.${getRandomInt(16, 30)}.${getRandomInt(1, 254)}.${getRandomInt(0,254) & 0xFC}` ]; 
                
                let lanIpStartLong = ipToLong(getRandom(lanBaseChoices));
                let linkIpStartStr = getRandom(linkBaseChoices);
                while(linkIpStartStr.split('.')[0] === longToIp(lanIpStartLong).split('.')[0] && linkIpStartStr.split('.')[1] === longToIp(lanIpStartLong).split('.')[1]) { 
                    linkIpStartStr = getRandom(linkBaseChoices); 
                }
                let linkIpStartLong = ipToLong(linkIpStartStr);
                
                return { lanIpStartLong, linkIpStartLong };
            }

            function createLinearTopology(numRouters) {
                let { lanIpStartLong, linkIpStartLong } = getAvailableIpSpace();
                let routers = []; let lans = []; let links = [];
                if (numRouters > 8) return null; 

                for (let i = 1; i <= numRouters; i++) {
                    const routerName = `R${i}`; routers.push(routerName);
                    const lanCidr = getRandomInt(24, 28); const lanSize = cidrToSize(lanCidr);
                    let nextLanStartLong = (lanIpStartLong + lanSize) >>> 0;
                    if (nextLanStartLong === 0 || nextLanStartLong < lanIpStartLong) { console.error("Dépassement LAN (linear)"); return null;} 
                    lans.push({ name: `LAN_${routerName}`, network: `${longToIp(lanIpStartLong)}/${lanCidr}`, cidr: lanCidr, connectedTo: routerName, routerIp: longToIp(lanIpStartLong + 1), routerInterface: 'fa0/0' });
                    lanIpStartLong = nextLanStartLong; 
                    
                    if (i > 1) {
                        const linkCidr = 30; const linkSize = cidrToSize(linkCidr);
                        linkIpStartLong = (linkIpStartLong + (linkSize - 1)) & (~(linkSize - 1)); 
                        let nextLinkStartLong = (linkIpStartLong + linkSize) >>> 0;
                        if (nextLinkStartLong === 0 || nextLinkStartLong < linkIpStartLong) { console.error("Dépassement Lien (linear)"); return null;} 
                        
                        const prevRouterName = `R${i-1}`;
                        links.push({ name: `Link_${prevRouterName}-${routerName}`, network: `${longToIp(linkIpStartLong)}/${linkCidr}`, cidr: linkCidr, 
                                     r1: prevRouterName, r1_ip: longToIp(linkIpStartLong + 1), r1_interface: 'fa0/1', 
                                     r2: routerName, r2_ip: longToIp(linkIpStartLong + 2), r2_interface: 'fa0/1' });
                        linkIpStartLong = nextLinkStartLong; 
                    }
                }
                return { routers, lans, links };
            }

            function createStarTopology(numRouters) {
                if (numRouters < 3) return createLinearTopology(numRouters); 
                let { lanIpStartLong, linkIpStartLong } = getAvailableIpSpace();
                let routers = []; let lans = []; let links = [];
                
                const centerRouter = `R1`; 
                routers.push(centerRouter);
                
                let lanCidr = getRandomInt(24, 28); let lanSize = cidrToSize(lanCidr);
                let nextLanStartLong = (lanIpStartLong + lanSize) >>> 0;
                if (nextLanStartLong === 0 || nextLanStartLong < lanIpStartLong) return null;
                lans.push({ name: `LAN_${centerRouter}`, network: `${longToIp(lanIpStartLong)}/${lanCidr}`, cidr: lanCidr, connectedTo: centerRouter, routerIp: longToIp(lanIpStartLong + 1), routerInterface: 'fa0/0' });
                lanIpStartLong = nextLanStartLong; 
                
                for (let i = 2; i <= numRouters; i++) {
                    const spokeRouter = `R${i}`;
                    routers.push(spokeRouter);
                    
                    lanCidr = getRandomInt(24, 28); lanSize = cidrToSize(lanCidr);
                    nextLanStartLong = (lanIpStartLong + lanSize) >>> 0;
                    if (nextLanStartLong === 0 || nextLanStartLong < lanIpStartLong) return null;
                    lans.push({ name: `LAN_${spokeRouter}`, network: `${longToIp(lanIpStartLong)}/${lanCidr}`, cidr: lanCidr, connectedTo: spokeRouter, routerIp: longToIp(lanIpStartLong + 1), routerInterface: 'fa0/0' });
                    lanIpStartLong = nextLanStartLong; 
                    
                    const linkCidr = 30; const linkSize = cidrToSize(linkCidr);
                    linkIpStartLong = (linkIpStartLong + (linkSize - 1)) & (~(linkSize - 1)); 
                    let nextLinkStartLong = (linkIpStartLong + linkSize) >>> 0;
                    if (nextLinkStartLong === 0 || nextLinkStartLong < linkIpStartLong) return null;
                    
                    links.push({ name: `Link_${centerRouter}-${spokeRouter}`, network: `${longToIp(linkIpStartLong)}/${linkCidr}`, cidr: linkCidr, 
                                 r1: centerRouter, r1_ip: longToIp(linkIpStartLong + 1), r1_interface: `fa0/${i-1}`, 
                                 r2: spokeRouter, r2_ip: longToIp(linkIpStartLong + 2), r2_interface: 'fa0/1' });
                    linkIpStartLong = nextLinkStartLong; 
                }
                return { routers, lans, links };
            }
            
            function calculateAllRoutingTables(topology) {
                let allTables = {};
                const { routers, lans, links } = topology;

                for (const routerName of routers) {
                    let table = [];
                    const myLans = lans.filter(l => l.connectedTo === routerName);
                    const myLinks = links.filter(l => l.r1 === routerName || l.r2 === routerName);
                    myLans.forEach(lan => { table.push({ type: 'C', network: lan.network, cidr: lan.cidr, nextHop: 'Connecté', interface: lan.routerInterface }); }); 
                    myLinks.forEach(link => { const myInterface = (link.r1 === routerName) ? link.r1_interface : link.r2_interface; table.push({ type: 'C', network: link.network, cidr: link.cidr, nextHop: 'Connecté', interface: myInterface }); }); 
                    
                    const allNetworks = [...lans, ...links];
                    const myNetworks = [...myLans, ...myLinks];
                    const remoteNetworks = allNetworks.filter(n => !myNetworks.some(mn => mn.network === n.network));
                    
                    for (const remoteNet of remoteNetworks) {
                        const { nextHopIp, exitInterface } = findNextHop(routerName, remoteNet, topology);
                        if (nextHopIp) {
                             table.push({ type: 'S', network: remoteNet.network, cidr: remoteNet.cidr, nextHop: nextHopIp, interface: exitInterface });
                        }
                    }
                    allTables[routerName] = table.sort((a,b) => ipToLong(a.network.split('/')[0]) - ipToLong(b.network.split('/')[0]));
                }
                return allTables;
            }

            function findNextHop(startRouter, targetNetwork, topology) {
                let queue = [ { router: startRouter, path: [], visited: new Set([startRouter]) } ];
                
                while (queue.length > 0) {
                    const { router, path, visited } = queue.shift();
                    const neighbors = topology.links.filter(l => l.r1 === router || l.r2 === router);
                    
                    for (const link of neighbors) {
                        const neighborName = (link.r1 === router) ? link.r2 : link.r1;
                        const nextHopIp = (link.r1 === router) ? link.r2_ip : link.r1_ip;
                        const exitInterface = (link.r1 === router) ? link.r1_interface : link.r2_interface;
                        
                        if (visited.has(neighborName)) continue;
                        
                        const newPath = [...path, { nextHopIp, exitInterface }];
                        
                        if (targetNetwork.connectedTo === neighborName || targetNetwork.r1 === neighborName || targetNetwork.r2 === neighborName) {
                            return path.length > 0 ? path[0] : { nextHopIp, exitInterface };
                        }
                        
                        visited.add(neighborName);
                        queue.push({ router: neighborName, path: newPath, visited: new Set(visited) });
                    }
                }
                return { nextHopIp: null, exitInterface: null }; 
            }

            function generateRoutingTopologySVG(topology) {
                const svgWidth = 1000;
                const svgHeight = 600;
                let svg = `<div style="width: 100%; overflow-x: auto; margin-bottom: 30px; padding: 0; border: 1px solid var(--controls-border); border-radius: 8px; background: var(--bg-container); box-shadow: 0 2px 5px var(--shadow-color);">`;
                svg += `<svg viewBox="0 0 ${svgWidth} ${svgHeight}" style="width: 100%; max-width: 100%; height: auto; min-width: 800px; display: block; margin: auto; font-family: 'Courier New', Courier, monospace;">`;

                // Grille Blueprint
                svg += `<defs><pattern id="bpGrid2" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--accent-secondary)" stroke-width="0.5" opacity="0.3"/></pattern></defs>`;
                svg += `<rect width="100%" height="100%" fill="url(#bpGrid2)" />`;

                const coords = {};
                const isStar = topology.links.some(l => topology.links.filter(lk => lk.r1 === l.r1 || lk.r2 === l.r1).length >= 2);

                if (isStar && topology.routers.length > 2) {
                coords['R1'] = { x: svgWidth / 2, y: svgHeight / 2 - 40 };
                    const spokes = topology.routers.filter(r => r !== 'R1');
                    const angleStep = Math.PI * 2 / spokes.length;
                    spokes.forEach((r, i) => {
                        coords[r] = {
                        x: svgWidth / 2 + 280 * Math.cos(i * angleStep + Math.PI/2),
                        y: svgHeight / 2 - 40 + 180 * Math.sin(i * angleStep + Math.PI/2)
                        };
                    });
                } else {
                    const stepX = svgWidth / (topology.routers.length + 1);
                    topology.routers.forEach((r, i) => {
                        coords[r] = { x: stepX * (i + 1), y: svgHeight / 2 };
                    });
                }

                topology.links.forEach(link => {
                    const p1 = coords[link.r1];
                    const p2 = coords[link.r2];
                    
                    // Câble technique
                    svg += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="var(--accent-primary)" stroke-width="2" stroke-dasharray="6,6" opacity="0.8"/>`;
                    
                    const mx = (p1.x + p2.x) / 2;
                    const my = (p1.y + p2.y) / 2;
                    svg += `<rect x="${mx - 85}" y="${my - 14}" width="170" height="28" fill="var(--bg-container)" stroke="var(--text-primary)" stroke-width="1" />`;
                    svg += `<text x="${mx}" y="${my + 5}" fill="var(--text-primary)" font-size="16" font-weight="bold" text-anchor="middle">${link.network}</text>`;
                });

                topology.lans.forEach(lan => {
                    const p = coords[lan.connectedTo];
                    const isTop = p.y >= svgHeight / 2;
                    const lanY = isTop ? p.y - 120 : p.y + 120;
                    
                    svg += `<line x1="${p.x}" y1="${p.y}" x2="${p.x}" y2="${lanY - 25}" stroke="var(--accent-primary)" stroke-width="2" stroke-dasharray="8,4" opacity="0.8"/>`;
                    svg += `<circle cx="${p.x}" cy="${lanY - 25}" r="5" fill="var(--accent-primary)" />`;
                    
                    // Switch Blueprint (Boîte avec croix)
                    svg += `<rect x="${p.x - 45}" y="${lanY - 20}" width="90" height="40" fill="var(--bg-container)" stroke="var(--text-primary)" stroke-width="2" />`;
                    svg += `<line x1="${p.x - 45}" y1="${lanY - 20}" x2="${p.x + 45}" y2="${lanY + 20}" stroke="var(--text-primary)" stroke-width="1" opacity="0.3"/>`;
                    svg += `<line x1="${p.x - 45}" y1="${lanY + 20}" x2="${p.x + 45}" y2="${lanY - 20}" stroke="var(--text-primary)" stroke-width="1" opacity="0.3"/>`;
                    svg += `<rect x="${p.x - 20}" y="${lanY - 10}" width="40" height="20" fill="var(--bg-container)" />`;
                    svg += `<text x="${p.x}" y="${lanY + 6}" fill="var(--text-primary)" font-size="16" font-weight="bold" text-anchor="middle">SW</text>`;
                    
                    // Textes (Nom du LAN et IP)
                    svg += `<text x="${p.x}" y="${isTop ? lanY - 35 : lanY + 45}" fill="var(--accent-secondary)" font-size="18" font-weight="bold" text-anchor="middle">[ ${lan.name.toUpperCase()} ]</text>`;
                    svg += `<text x="${p.x}" y="${isTop ? lanY - 50 : lanY + 65}" fill="var(--text-secondary)" font-size="16" text-anchor="middle">${lan.network}</text>`;
                });

                topology.routers.forEach(r => {
                    const p = coords[r];
                    // Routeur Blueprint (Wireframe avec Réticule)
                    svg += `<circle cx="${p.x}" cy="${p.y}" r="45" fill="var(--bg-container)" stroke="var(--accent-primary)" stroke-width="2" />`;
                    svg += `<circle cx="${p.x}" cy="${p.y}" r="35" fill="none" stroke="var(--accent-secondary)" stroke-width="1" stroke-dasharray="4,4" />`;
                    svg += `<path d="M ${p.x} ${p.y-55} L ${p.x} ${p.y+55} M ${p.x-55} ${p.y} L ${p.x+55} ${p.y}" stroke="var(--accent-primary)" stroke-width="1" opacity="0.5"/>`;
                    svg += `<rect x="${p.x-25}" y="${p.y-12}" width="50" height="24" fill="var(--bg-container)" />`;
                    svg += `<text x="${p.x}" y="${p.y+6}" fill="var(--text-primary)" font-size="20" font-weight="bold" text-anchor="middle">${r}</text>`;
                });

                svg += `</svg></div>`;
                return svg;
            }

            function displayRoutingExercise(exerciseData) { 
                routingExerciseOutput.innerHTML = ''; 
                localStorage.setItem('activeRouting', JSON.stringify(exerciseData));
                const isFav = isFavorite(exerciseData, 'routing'); const starIcon = isFav ? '★' : '☆'; const starClass = isFav ? 'is-favorite' : '';
                const titleEl = document.createElement('div'); titleEl.className = 'scenario-title'; titleEl.style.width = '100%'; titleEl.style.marginBottom = '20px';
                titleEl.innerHTML = `<h2>${exerciseData.title}</h2><span id="saveRoutingFavoriteBtn" class="favorite-star ${starClass}" title="Ajouter/Retirer des favoris">${starIcon}</span>`;
                routingExerciseOutput.appendChild(titleEl);
                const saveRoutingFavBtn = document.getElementById('saveRoutingFavoriteBtn');
                if (saveRoutingFavBtn) saveRoutingFavBtn.onclick = () => toggleFavorite('routing');
                
                for (const routerName in exerciseData.tables) {
                    const tableData = exerciseData.tables[routerName]; const container = document.createElement('div'); container.className = 'routing-table-container';
                    let tableHTML = `<table class="routing-table"><caption>${routerName}</caption><thead><tr><th>Type</th><th>IDSR</th><th>CIDR</th><th>INTERFACE</th><th>PASSERELLE</th></tr></thead><tbody>`;
                    tableData.forEach(route => { const networkId = route.network.split('/')[0]; const gatewayDisplay = route.nextHop; tableHTML += `<tr><td class="route-type-${route.type.toLowerCase()}">${route.type}</td><td>${networkId}</td><td>/${route.cidr}</td><td>${route.interface}</td> <td>${gatewayDisplay}</td></tr>`; });
                    tableHTML += `</tbody></table>`; container.innerHTML = tableHTML; routingExerciseOutput.appendChild(container);
                }
                
                routingNotepadContainer.style.display = 'block';
                const notes = routingNotepads[currentRoutingExercise.id] || "";
                document.getElementById('routingNotepad').value = notes;
                document.getElementById('routingNotepadStatus').textContent = "";
            }
            
            // --- SECTION EXERCICES DE SEGMENTATION (MIS À JOUR) ---
            
            const btnGenerateSegmentationByNetwork = document.getElementById('btnGenerateSegmentationByNetwork');
            const btnGenerateSegmentationByHosts = document.getElementById('btnGenerateSegmentationByHosts');
            const btnGenerateSegmentationCustomToggle = document.getElementById('btnGenerateSegmentationCustomToggle'); 
            const customSegmentationControls = document.getElementById('customSegmentationControls'); 
            const formSegmentationCustom = document.getElementById('formSegmentationCustom'); 
            
            // MODIFICATION: Sélection des radios pour basculer les champs
            const customSegTypeRadios = document.querySelectorAll('input[name="customSegType"]');
            const customSegHostsFieldset = document.getElementById('customSegHostsFieldset');
            const customSegNetCountFieldset = document.getElementById('customSegNetCountFieldset');

            // Écouteur pour le basculement Hosts/Network dans le form personnalisé
            customSegTypeRadios.forEach(radio => {
                radio.addEventListener('change', () => {
                    if (radio.value === 'hosts') {
                        customSegHostsFieldset.style.display = 'block';
                        customSegNetCountFieldset.style.display = 'none';
                    } else {
                        customSegHostsFieldset.style.display = 'none';
                        customSegNetCountFieldset.style.display = 'block';
                    }
                });
            });

            const segmentationExercisePromptEl = document.getElementById('segmentationExercisePrompt');
            const segmentationCheckerContainer = document.getElementById('segmentationCheckerContainer');
            const segmentationCheckerInputs = document.getElementById('segmentationCheckerInputs');
            const segmentationNotepadContainer = document.getElementById('segmentationNotepadContainer');
            
            const btnCheckSegmentationSolution = document.getElementById('btnCheckSegmentationSolution');
            const btnShowSegmentationSolution = document.getElementById('btnShowSegmentationSolution');
            const segmentationSolutionContainerEl = document.getElementById('segmentationSolutionContainer');
            
            let currentSegmentationExercise = null; 
            let currentSegmentationSolution = null; 

            btnGenerateSegmentationByNetwork.addEventListener('click', generateSegmentationByNetworkExercise);
            btnGenerateSegmentationByHosts.addEventListener('click', generateSegmentationByHostsExercise);
            btnShowSegmentationSolution.addEventListener('click', displaySegmentationSolution);
            btnCheckSegmentationSolution.addEventListener('click', checkSegmentationSolution);
            
            btnGenerateSegmentationCustomToggle.addEventListener('click', () => {
                customSegmentationControls.style.display = 'block';
                segmentationExercisePromptEl.innerHTML = '<p class="welcome">Configurez votre exercice personnalisé ci-dessus.</p>';
                segmentationSolutionContainerEl.style.display = 'none';
                segmentationCheckerContainer.style.display = 'none';
                segmentationNotepadContainer.style.display = 'none';
                btnShowSegmentationSolution.style.display = 'none';
                btnCheckSegmentationSolution.style.display = 'none';
            });
            
            formSegmentationCustom.addEventListener('submit', (e) => {
                 e.preventDefault();
                 generateCustomSegmentationExercise();
            });


             function generateSegmentationByNetworkExercise() {
                customSegmentationControls.style.display = 'none'; 
                const baseNetwork = getRandomBaseNetwork(getRandom(['Facile', 'Moyen', 'Difficile'])); 
                
                // MODIF: Utilisation de getRandomInt(3, 12) pour autoriser les impairs
                const N = getRandomInt(3, 12); 
                const bitsNeeded = Math.ceil(Math.log2(N));
                
                if (baseNetwork.cidr + bitsNeeded > 31) { 
                    generateSegmentationByNetworkExercise(); 
                    return;
                }

                const exerciseData = {
                    id: Date.now(), title: `Segmentation /${baseNetwork.cidr} en ${N} réseaux`, 
                    type: 'segmentation', subType: 'network', 
                    baseIp: baseNetwork.address, baseCidr: baseNetwork.cidr, N: N
                };
                
                currentSegmentationSolution = calculateSegmentationByNetworkSolution(exerciseData.baseIp, exerciseData.baseCidr, exerciseData.N);
                displaySegmentationExercise(exerciseData); 
            }
            
            function generateSegmentationByHostsExercise() {
                 customSegmentationControls.style.display = 'none'; 
                 const baseNetwork = getRandomBaseNetwork(getRandom(['Facile', 'Moyen', 'Difficile'])); 
                 const numSubnets = getRandomInt(3, 6);
                 let hostRequirements = [];
                 const possibleHostCounts = [getRandomInt(50, 200), getRandomInt(20, 40), getRandomInt(5, 15), getRandomInt(1, 4), getRandomInt(1, 4), getRandomInt(1, 4)]; 
                 
                 for(let i=0; i < numSubnets; i++) {
                     hostRequirements.push({ name: `Réseau ${String.fromCharCode(65 + i)}`, hosts: possibleHostCounts[i] || getRandomInt(1, 5) });
                 }
                 const totalHostsApproximation = hostRequirements.reduce((sum, req) => sum + req.hosts + 2, 0);
                 if (Math.pow(2, 32 - baseNetwork.cidr) < totalHostsApproximation * 1.5) { 
                     generateSegmentationByHostsExercise(); 
                     return;
                 }

                 const exerciseData = {
                    id: Date.now(), title: `Segmentation VLSM /${baseNetwork.cidr} (${numSubnets} besoins)`, 
                    type: 'segmentation', subType: 'hosts', 
                    baseIp: baseNetwork.address, baseCidr: baseNetwork.cidr,
                    requirements: hostRequirements.sort((a,b) => b.hosts - a.hosts) 
                 };
                 
                 currentSegmentationSolution = calculateVLSM(exerciseData.baseIp, exerciseData.baseCidr, exerciseData.requirements);
                 displaySegmentationExercise(exerciseData); 
            }
            
            // MODIFICATION: Fonction de génération personnalisée mise à jour (accepte N != puissance de 2)
            function generateCustomSegmentationExercise() {
                const networkStr = document.getElementById('customSegBaseNetwork').value;
                const segType = document.querySelector('input[name="customSegType"]:checked').value;
                
                const networkParts = networkStr.split('/');
                if (networkParts.length !== 2 || ipToLong(networkParts[0]) === null || parseMask(`/${networkParts[1]}`) === null ) { 
                    alert("Erreur : Le réseau de base doit être au format IP/CIDR valide.");
                    return;
                }
                const baseCidr = parseInt(networkParts[1], 10);
                const inputIpLong = ipToLong(networkParts[0]);
                const maskLong = ipToLong(cidrToMask(baseCidr));
                const baseIpLong = (inputIpLong & maskLong) >>> 0;
                const baseIp = longToIp(baseIpLong);
                
                let exerciseData = {};
                
                if (segType === 'hosts') {
                    const requirements = parseHostInputsForm('customSegHostsContainer'); 
                    if (requirements.length === 0) {
                        alert("Erreur : Veuillez remplir au moins un besoin en hôte.");
                        return;
                    }
                    exerciseData = {
                        id: Date.now(), title: `Segmentation Perso (VLSM) /${baseCidr}`,
                        type: 'segmentation', subType: 'hosts', 
                        baseIp: baseIp, baseCidr: baseCidr, requirements: requirements 
                    };
                    currentSegmentationSolution = calculateVLSM(exerciseData.baseIp, exerciseData.baseCidr, exerciseData.requirements);
                } else {
                    // Logique pour le type "Par Réseaux" (Network)
                    const netCount = parseInt(document.getElementById('customSegNetworkCount').value, 10);
                    
                    // MODIF: Suppression du test de puissance de 2
                    if (isNaN(netCount) || netCount < 2) {
                         alert("Erreur: Le nombre de réseaux doit être au moins 2.");
                         return;
                    }
                    
                    const bitsNeeded = Math.ceil(Math.log2(netCount));
                    if (baseCidr + bitsNeeded > 31) {
                        alert("Erreur: Impossible de créer autant de réseaux avec ce CIDR de départ (dépassement /31).");
                        return;
                    }
                    exerciseData = {
                        id: Date.now(), title: `Segmentation Perso /${baseCidr} en ${netCount} réseaux`,
                        type: 'segmentation', subType: 'network',
                        baseIp: baseIp, baseCidr: baseCidr, N: netCount
                    };
                    currentSegmentationSolution = calculateSegmentationByNetworkSolution(exerciseData.baseIp, exerciseData.baseCidr, exerciseData.N);
                }

                displaySegmentationExercise(exerciseData);
                customSegmentationControls.style.display = 'none'; 
            }

            function displaySegmentationExercise(exerciseData) {
                 const isFav = isFavorite(exerciseData, 'segmentation');
                 const starIcon = isFav ? '★' : '☆';
                 const starClass = isFav ? 'is-favorite' : '';
                 
                 localStorage.setItem('activeSegmentation', JSON.stringify(exerciseData));
                 currentSegmentationExercise = exerciseData; 

                 let promptHTML = `
                    <div class="scenario-title"> 
                        <h2>${exerciseData.title}</h2> 
                        <span id="saveSegmentationFavoriteBtn" class="favorite-star ${starClass}" title="Ajouter/Retirer des favoris">${starIcon}</span>
                    </div>`;

                segmentationCheckerInputs.innerHTML = '';
                let requirements = []; 
                 if (exerciseData.subType === 'network') {
                     // MODIF: Affichage intelligent selon le nombre N
                     if (exerciseData.N <= 5) {
                         promptHTML += `<p>Segmentez le réseau <strong>${exerciseData.baseIp}/${exerciseData.baseCidr}</strong> en <strong>${exerciseData.N}</strong> sous-réseaux.</p>
                                        <p>Donnez les informations pour tous les réseaux.</p>`;
                         for(let i=0; i < exerciseData.N; i++) {
                             requirements.push({ name: `Sous-réseau ${i+1}`, solutionIndex: i });
                         }
                     } else {
                         promptHTML += `<p>Segmentez le réseau <strong>${exerciseData.baseIp}/${exerciseData.baseCidr}</strong> en <strong>${exerciseData.N}</strong> sous-réseaux.</p>
                                        <p>Donnez les informations pour les 3 premiers réseaux et le dernier réseau.</p>`;
                         requirements.push({ name: `Sous-réseau 1`, solutionIndex: 0 });
                         requirements.push({ name: `Sous-réseau 2`, solutionIndex: 1 });
                         requirements.push({ name: `Sous-réseau 3`, solutionIndex: 2 });
                         requirements.push({ name: `...`, solutionIndex: -1 }); 
                         requirements.push({ name: `Sous-réseau ${exerciseData.N}`, solutionIndex: exerciseData.N - 1 });
                     }
                    
                 } else { 
                     let requirementsHtml = '<ul>';
                     exerciseData.requirements.forEach(req => {
                         requirementsHtml += `<li><strong>${req.name}:</strong> ${req.hosts} hôtes</li>`;
                     });
                     requirementsHtml += '</ul>';
                     promptHTML += `
                        <p>Segmentez le réseau <strong>${exerciseData.baseIp}/${exerciseData.baseCidr}</strong> pour répondre aux besoins suivants (VLSM) :</p>
                        ${requirementsHtml}
                        <p>Pour chaque sous-réseau, donnez : IDSR, Masque, et Plage Utilisable.</p>`;
                    exerciseData.requirements.forEach((req, index) => {
                        requirements.push({ name: req.name, solutionIndex: index });
                    });
                 }
                 
                 requirements.forEach((req) => {
                     const row = document.createElement('div');
                     row.className = 'checker-row';
                     
                     if (req.solutionIndex === -1) { 
                         row.classList.add('separator');
                         row.innerHTML = `<div>...</div>`;
                     } else {
                         row.innerHTML = `
                            <div class="checker-row-title">${req.name}</div>
                            <input type="text" class="checker-input" data-index="${req.solutionIndex}" data-field="networkId" placeholder="ID Réseau">
                            <input type="text" class="checker-input" data-index="${req.solutionIndex}" data-field="mask" placeholder="Masque/CIDR">
                            <input type="text" class="checker-input" data-index="${req.solutionIndex}" data-field="range" placeholder="Plage (ex: 1.1 - 1.254)">
                         `;
                     }
                     segmentationCheckerInputs.appendChild(row);
                 });
                 
                 segmentationExercisePromptEl.innerHTML = promptHTML;
                 segmentationCheckerContainer.style.display = 'block';
                 
                 segmentationNotepadContainer.style.display = 'block';
                 const notes = segmentationNotepads[exerciseData.id] || "";
                 document.getElementById('segmentationNotepad').value = notes;
                 document.getElementById('segmentationNotepadStatus').textContent = "";
                 
                 btnCheckSegmentationSolution.style.display = 'inline-block';      
                 btnShowSegmentationSolution.style.display = 'inline-block'; 
                 
                 const saveSegFavBtn = document.getElementById('saveSegmentationFavoriteBtn');
                 if (saveSegFavBtn) saveSegFavBtn.onclick = () => toggleFavorite('segmentation');
            }
            
            function checkSegmentationSolution() {
                if (!currentSegmentationSolution || !currentSegmentationSolution.solution) {
                    alert("Impossible de vérifier, la solution n'a pas pu être calculée.");
                    return;
                }
                
                const solution = currentSegmentationSolution.solution;
                const inputs = segmentationCheckerInputs.querySelectorAll('.checker-input');
                let allCorrect = true;
                
                inputs.forEach(input => {
                    const index = parseInt(input.dataset.index, 10);
                    const field = input.dataset.field;
                    const userValue = input.value.trim().replace(/\s/g, ''); 
                    
                    if (index >= solution.length) return; 
                    
                    const solNet = solution[index];
                    let isCorrect = false;
                    
                    switch(field) {
                        case 'networkId':
                            isCorrect = (userValue === solNet.networkId);
                            break;
                        case 'mask':
                            const userCidr = parseMask(userValue);
                            const solCidr = parseInt(solNet.cidr.substring(1), 10);
                            isCorrect = (userValue === solNet.mask || (userCidr !== null && userCidr === solCidr));
                            break;
                        case 'range':
                            let solRange = 'N/A';
                            const cidrVal = parseInt(solNet.cidr.substring(1));
                            if (cidrVal <= 30) solRange = `${solNet.firstIp}-${solNet.lastIp}`;
                            else if (cidrVal === 31) solRange = `${solNet.firstIp},${solNet.lastIp}`;
                            else solRange = solNet.networkId;
                            
                            isCorrect = (userValue.replace(/-/g, '') === solRange.replace(/-/g, ''));
                            break;
                    }
                    
                    input.classList.remove('correct', 'incorrect');
                    if (userValue) { 
                        if (isCorrect) {
                            input.classList.add('correct');
                        } else {
                            input.classList.add('incorrect');
                            allCorrect = false;
                        }
                    } else {
                         allCorrect = false; 
                    }
                });
                
                if (allCorrect) {
                    alert("Félicitations ! Toutes vos réponses sont correctes ! 🎉");
                } else {
                    alert("Certaines réponses sont incorrectes (en rouge). Essayez encore !");
                }
            }
            

            function displaySegmentationSolution() {
                 if (!currentSegmentationSolution) return;

                 let solutionData = currentSegmentationSolution;
                 let html = '';
                 
                 if (solutionData.error) {
                     html += `<p class="error">${solutionData.error}</p>`;
                 } else if (currentSegmentationExercise.subType === 'network') { 
                     const firstSubnet = solutionData.solution[0]; 
                     // Appel à la fonction modifiée avec 4 arguments
                     html += generateFormulaExplanation(firstSubnet, 'network', currentSegmentationExercise.baseCidr, currentSegmentationExercise.N);
                     
                     solutionData.solution.forEach((subnet, index) => {
                         // Affiche tout si <= 5, sinon affiche les 3 premiers et le dernier
                         const N = currentSegmentationExercise.N;
                         const showAll = N <= 5;
                         
                        if(showAll || index < 3 || index === solutionData.solution.length - 1) { 
                            html += `
                                <div class="segmentation-solution-block">
                                    <h4>Sous-réseau ${subnet.index}</h4>
                                    <ul>
                                        <li><strong>IDSR :</strong> ${subnet.networkId}</li>
                                        <li><strong>Broadcast :</strong> ${subnet.broadcast}</li>
                                        <li><strong>Masque :</strong> ${subnet.mask} (${subnet.cidr})</li>
                                        <li><strong>Plage IP :</strong> ${subnet.firstIp} - ${subnet.lastIp}</li>
                                    </ul>
                                    </div>
                            `;
                            if(!showAll && index === 2 && solutionData.solution.length > 4) { 
                                 html += `<p style="text-align: center; font-size: 1.5em; margin: 10px 0;">...</p>`;
                            }
                        }
                     });
                 } else { 
                     solutionData.solution.forEach(subnet => { 
                         html += `
                            <div class="segmentation-solution-block">
                                <h4>${subnet.name} (Besoin: ${subnet.hosts} hôtes)</h4>
                                <ul>
                                    <li><strong>IDSR :</strong> ${subnet.networkId}</li>
                                    <li><strong>Broadcast :</strong> ${subnet.broadcast}</li>
                                    <li><strong>Masque :</strong> ${subnet.mask} (${subnet.cidr})</li>
                                    <li><strong>Plage IP :</strong> ${subnet.firstIp} - ${subnet.lastIp}</li>
                                </ul>
                                ${generateFormulaExplanation(subnet, 'hosts')} 
                            </div>
                        `;
                     });
                 }

                 document.getElementById('globalModalTitle').innerHTML = "Solution de Segmentation";
                 document.getElementById('globalModalBody').innerHTML = html;
                 document.getElementById('globalModal').style.display = 'flex';
            }
            
            // --- SECTION QUIZ (CHARGEMENT DEPUIS JSON) ---
            let quizQuestions = [];
            
            fetch('quiz.json')
                .then(response => {
                    if (!response.ok) throw new Error("Erreur HTTP " + response.status);
                    return response.json();
                })
                .then(data => {
                    quizQuestions = data;
                    console.log(`Quiz chargé : ${quizQuestions.length} questions.`);
                    if (document.querySelector('.tab-button[data-tab="quiz"]').classList.contains('active') && quizCurrentQuestionIndex === -1) {
                        loadQuizQuestion();
                    }
                })
                .catch(error => {
                    console.error('Erreur lors du chargement du quiz:', error);
                    const quizQuestionEl = document.getElementById('quizQuestion');
                    if (quizQuestionEl) quizQuestionEl.innerHTML = `<span style="color:var(--error-text)">Erreur de chargement. Vérifiez que le fichier quiz.json existe bien dans le dossier.</span>`;
                });

            const quizQuestionEl = document.getElementById('quizQuestion');
            const quizOptionsEl = document.getElementById('quizOptions');
            const quizFeedbackEl = document.getElementById('quizFeedback');
            const quizScoreEl = document.getElementById('quizScore');
            const nextQuestionButton = document.getElementById('nextQuestionButton');
            const showHintButton = document.getElementById('showHintButton');
            const quizHintEl = document.getElementById('quizHint');
            const quizBadgesEl = document.getElementById('quizBadges');
            const confettiContainer = document.getElementById('confetti-container');

            let quizCurrentQuestionIndex = -1;
            let questionsAskedIndices = []; 
            let quizHintUsed = false; 
            
            let quizScore = 0;
            let quizStreak = 0;
            let quizBadges = [];
            let quizTotalAttempts = 0;
            let quizCorrectAnswers = 0;
            const QUIZ_DATA_KEY = 'networkQuizData';

            function loadQuizData() {
                const data = JSON.parse(localStorage.getItem(QUIZ_DATA_KEY) || '{}');
                quizScore = data.score || 0;
                quizStreak = data.streak || 0;
                quizBadges = data.badges || [];
                quizTotalAttempts = data.totalAttempts || 0;
                quizCorrectAnswers = data.correctAnswers || 0;
            }
            function saveQuizData() {
                const data = {
                    score: quizScore,
                    streak: quizStreak,
                    badges: quizBadges,
                    totalAttempts: quizTotalAttempts,
                    correctAnswers: quizCorrectAnswers
                };
                localStorage.setItem(QUIZ_DATA_KEY, JSON.stringify(data));
            }
            
            loadQuizData(); 

            function shuffleArray(array) { 
                for (let i = array.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [array[i], array[j]] = [array[j], array[i]];
                }
            }

            // --- LOGIQUE QUIZ MISE À JOUR ---

            const quizCategorySelect = document.getElementById('quizCategorySelect');

            // Écouteur pour le changement de catégorie
            quizCategorySelect.addEventListener('change', () => {
                questionsAskedIndices = []; // On réinitialise l'historique des questions posées
                quizCurrentQuestionIndex = -1;
                loadQuizQuestion(); // On charge une nouvelle question
            });

            function loadQuizQuestion() {
                // 1. Déterminer la plage d'index en fonction de la sélection
                const selection = quizCategorySelect.value;
                let minIndex = 0;
                let maxIndex = quizQuestions.length;

                if (selection !== 'all') {
                    const parts = selection.split('-');
                    minIndex = Math.min(parseInt(parts[0], 10), quizQuestions.length);
                    maxIndex = Math.min(parseInt(parts[1], 10), quizQuestions.length);
                }

                // 2. Vérifier si toutes les questions DE CETTE CATÉGORIE ont été posées
                // On filtre les questions déjà posées pour voir si elles appartiennent à la plage actuelle
                const askedInThisRange = questionsAskedIndices.filter(idx => idx >= minIndex && idx < maxIndex);
                const totalQuestionsInThisRange = maxIndex - minIndex;

                if (askedInThisRange.length >= totalQuestionsInThisRange) {
                     // Reset pour cette catégorie spécifiquement
                     // On retire les index de cette plage de la liste globale 'asked' pour recommencer
                     questionsAskedIndices = questionsAskedIndices.filter(idx => idx < minIndex || idx >= maxIndex);
                     
                     quizQuestionEl.textContent = "Catégorie terminée ! On recommence le cycle...";
                     quizOptionsEl.innerHTML = ''; 
                     quizFeedbackEl.textContent = '';
                     nextQuestionButton.style.display = 'none'; 
                     setTimeout(loadQuizQuestion, 2000); 
                     return;
                }

                // 3. Tirer un index aléatoire DANS la plage sélectionnée
                let randomIndex;
                do {
                    // Formule : Math.random() * (max - min) + min
                    randomIndex = Math.floor(Math.random() * (maxIndex - minIndex)) + minIndex;
                } while (questionsAskedIndices.includes(randomIndex));
                
                questionsAskedIndices.push(randomIndex);
                quizCurrentQuestionIndex = randomIndex;
                quizHintUsed = false; 
                
                const question = quizQuestions[quizCurrentQuestionIndex];
                
                // --- Reste de la fonction (Affichage) identique ---
                quizQuestionEl.textContent = question.q;
                quizOptionsEl.innerHTML = ''; 
                quizFeedbackEl.textContent = ''; quizFeedbackEl.className = '';
                nextQuestionButton.style.display = 'none';
                
                quizHintEl.textContent = question.h;
                quizHintEl.style.display = 'none';
                showHintButton.style.display = 'block';

                const shuffledOptions = [...question.o]; 
                shuffleArray(shuffledOptions);

                shuffledOptions.forEach(option => {
                    const button = document.createElement('button');
                    button.textContent = option; button.className = 'quiz-option-button';
                    button.onclick = () => checkAnswer(option, button);
                    quizOptionsEl.appendChild(button);
                });
                
                updateQuizDisplay(); 
            }

            function checkAnswer(selectedOption, buttonEl) {
                const question = quizQuestions[quizCurrentQuestionIndex];
                const isCorrect = (selectedOption === question.a);

                quizTotalAttempts++;

                const optionButtons = quizOptionsEl.querySelectorAll('.quiz-option-button');
                optionButtons.forEach(btn => btn.disabled = true);
                showHintButton.style.display = 'none'; 
                quizHintEl.style.display = 'none'; 

                let feedbackMessage = '';
                
                if (isCorrect) {
                    quizCorrectAnswers++;
                    let pointsGained = 0;
                    if (quizHintUsed) {
                        pointsGained = 0.5;
                        quizStreak = 0; 
                        feedbackMessage = `Correct ! +0.5 pt (indice utilisé).`;
                    } else {
                        pointsGained = 1;
                        quizStreak++; 
                        feedbackMessage = `Correct ! +1 pt.`;
                    }
                    quizScore += pointsGained;
                    
                    quizFeedbackEl.innerHTML = `${feedbackMessage} <small>${question.e}</small>`;
                    quizFeedbackEl.className = 'correct';
                    buttonEl.classList.add('correct');
                    checkStreakMilestones();

                } else {
                    quizStreak = 0; 
                    quizScore -= 0.5; // Application de la pénalité
                    quizFeedbackEl.innerHTML = `Incorrect ! -0.5 pt.<br>La bonne réponse est : <strong>${question.a}</strong> <small>${question.e}</small>`;
                    quizFeedbackEl.className = 'incorrect';
                    buttonEl.classList.add('incorrect');
                     optionButtons.forEach(btn => { if (btn.textContent === question.a) btn.classList.add('correct'); });
                }
                
                saveQuizData(); 
                updateQuizDisplay(); 
                nextQuestionButton.style.display = 'block'; 
            }
            
            function updateQuizDisplay() {
                quizScoreEl.textContent = `Score: ${quizScore} | Série: ${quizStreak} 🔥`;
                const accuracy = quizTotalAttempts > 0 ? Math.round((quizCorrectAnswers / quizTotalAttempts) * 100) : 0;
                quizScoreEl.innerHTML = `Score: <strong>${quizScore}</strong> | Précision: <strong>${accuracy}%</strong> | Série: ${quizStreak} 🔥`;
                quizBadgesEl.innerHTML = '';
                if (quizBadges.includes('silver')) {
                    quizBadgesEl.innerHTML += `<span class="quiz-badge badge-silver">Expert Silver 🥈</span>`;
                }
                if (quizBadges.includes('gold')) {
                    quizBadgesEl.innerHTML += `<span class="quiz-badge badge-gold">Maître Gold 🥇</span>`;
                }
            }
            
            function checkStreakMilestones() {
                let milestoneMessage = '';
                if (quizStreak === 5) {
                    milestoneMessage = " Belle série de 5 ! Continuez !";
                } else if (quizStreak === 15) {
                    if (!quizBadges.includes('silver')) {
                        milestoneMessage = " 15 de suite ! Badge Silver 🥈 débloqué !";
                        quizBadges.push('silver');
                    }
                } else if (quizStreak === 30) {
                     if (!quizBadges.includes('gold')) {
                        milestoneMessage = " 30 DE SUITE ! Badge Gold 🥇 débloqué ! Incroyable !";
                        quizBadges.push('gold');
                        playConfetti(); 
                    }
                }
                
                if (milestoneMessage) {
                    quizFeedbackEl.innerHTML += `<br><strong>${milestoneMessage}</strong>`;
                }
            }
            
            function playConfetti() {
                const colors = ['#f00', '#0f0', '#00f', '#ff0', '#0ff', '#f0f'];
                for (let i = 0; i < 100; i++) {
                    const confetti = document.createElement('div');
                    confetti.className = 'confetti';
                    confetti.style.left = `${Math.random() * 100}vw`;
                    confetti.style.animationDelay = `${Math.random() * 0.5}s`;
                    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                    confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
                    
                    confettiContainer.appendChild(confetti);
                    
                    setTimeout(() => {
                        confetti.remove();
                    }, 3000); 
                }
            }
            
            showHintButton.addEventListener('click', () => {
                quizHintUsed = true;
                quizHintEl.style.display = 'block';
                showHintButton.style.display = 'none';
            });
            
            nextQuestionButton.addEventListener('click', loadQuizQuestion);

            
            // --- SECTION LOGIQUE BLOC-NOTES (GÉNÉRALISÉE) ---
            
            function setupNotepad(type, buttonId, textareaId, statusId) {
                const saveButton = document.getElementById(buttonId);
                const textarea = document.getElementById(textareaId);
                const statusEl = document.getElementById(statusId);
                
                function saveCurrentNote() {
                    let currentItem;
                    let notepads;
                    if(type === 'scenario') { currentItem = currentScenario; notepads = scenarioNotepads; }
                    else if(type === 'routing') { currentItem = currentRoutingExercise; notepads = routingNotepads; }
                    else if(type === 'segmentation') { currentItem = currentSegmentationExercise; notepads = segmentationNotepads; }
                    else return;
                    
                    if (!currentItem || !currentItem.id) return;
                    
                    notepads[currentItem.id] = textarea.value;
                    saveNotepad(type);
                }

                if (saveButton) {
                    saveButton.addEventListener('click', () => {
                        saveCurrentNote();
                        statusEl.textContent = "Sauvegardé !";
                        statusEl.style.color = "var(--correct-text)";
                        setTimeout(() => { statusEl.textContent = ""; }, 2000);
                    });
                }

                if (textarea) {
                    textarea.addEventListener('input', () => {
                        saveCurrentNote();
                        statusEl.textContent = "Sauvegarde auto...";
                        statusEl.style.color = "var(--text-secondary)";
                        setTimeout(() => { if(statusEl.textContent === "Sauvegarde auto...") statusEl.textContent = ""; }, 1500);
                    });
                }
            }
            
            setupNotepad('scenario', 'saveScenarioNotepadButton', 'scenarioNotepad', 'scenarioNotepadStatus');
            setupNotepad('routing', 'saveRoutingNotepadButton', 'routingNotepad', 'routingNotepadStatus');
            setupNotepad('segmentation', 'saveSegmentationNotepadButton', 'segmentationNotepad', 'segmentationNotepadStatus');


            // --- SECTION LOGIQUE CONVERTISSEUR BINAIRE (MISE À JOUR) ---
            
            const decInput = document.getElementById('decInput');
            const binInput = document.getElementById('binInput');
            const decToBinButton = document.getElementById('decToBinButton');
            const binToDecButton = document.getElementById('binToDecButton');

            if (decToBinButton) {
                decToBinButton.addEventListener('click', () => {
                    const val = decInput.value.trim();
                    
                    // Cas 1 : C'est une IP (contient des points)
                    if (val.includes('.')) {
                        const parts = val.split('.');
                        // On vérifie qu'on a bien 4 parties et que ce sont des octets valides
                        const isValidIp = parts.length === 4 && parts.every(part => {
                            const n = parseInt(part, 10);
                            return !isNaN(n) && n >= 0 && n <= 255 && part.trim() !== '';
                        });

                        if (isValidIp) {
                            const binaryParts = parts.map(part => parseInt(part, 10).toString(2).padStart(8, '0'));
                            binInput.value = binaryParts.join('.');
                        } else {
                            binInput.value = "IP Invalide";
                        }
                    } 
                    // Cas 2 : C'est un nombre simple (0-255)
                    else {
                        const decVal = parseInt(val, 10);
                        if (!isNaN(decVal) && decVal >= 0 && decVal <= 255) {
                            binInput.value = decVal.toString(2).padStart(8, '0');
                        } else {
                            binInput.value = "Invalide (0-255 ou IP)";
                        }
                    }
                });
            }

            loadFavorites();
            // --- RESTAURATION DE LA SESSION ACTIVE ---
            function restoreActiveSessions() {
                try {
                    const savedScenario = JSON.parse(localStorage.getItem('activeScenario'));
                    if (savedScenario && savedScenario.baseNetwork) {
                        currentScenario = savedScenario;
                        currentDifficulty = savedScenario.difficulty;
                        currentGatewayRule = savedScenario.gatewayRule;
                        displayScenario(savedScenario, true);
                    }

                    const savedRouting = JSON.parse(localStorage.getItem('activeRouting'));
                    if (savedRouting && savedRouting.topology) {
                        currentRoutingExercise = savedRouting;
                        displayRoutingExercise(savedRouting);
                    }

                    const savedSegmentation = JSON.parse(localStorage.getItem('activeSegmentation'));
                    if (savedSegmentation && savedSegmentation.baseIp) {
                        currentSegmentationExercise = savedSegmentation;
                        if (savedSegmentation.subType === 'network') {
                            currentSegmentationSolution = calculateSegmentationByNetworkSolution(savedSegmentation.baseIp, savedSegmentation.baseCidr, savedSegmentation.N);
                        } else {
                            currentSegmentationSolution = calculateVLSM(savedSegmentation.baseIp, savedSegmentation.baseCidr, savedSegmentation.requirements);
                        }
                        displaySegmentationExercise(savedSegmentation);
                    }
                } catch (e) {
                    console.error("Erreur de restauration de la session active", e);
                }
            }
            restoreActiveSessions();

            // Gestion de l'URL au chargement initial (Placé à la fin pour éviter les erreurs d'initialisation)
            const initialHash = window.location.hash.substring(1);
            if (initialHash && document.getElementById(initialHash)) {
                switchTab(initialHash, false);
            } else {
                history.replaceState({ tab: 'home' }, '', '#home');
            }

            if (binToDecButton) {
                binToDecButton.addEventListener('click', () => {
                    const val = binInput.value.trim();

                    // Cas 1 : C'est une IP binaire (contient des points)
                    if (val.includes('.')) {
                        const parts = val.split('.');
                        const isValidBinIp = parts.length === 4 && parts.every(part => /^[01]{8}$/.test(part));

                        if (isValidBinIp) {
                            const decimalParts = parts.map(part => parseInt(part, 2));
                            decInput.value = decimalParts.join('.');
                        } else {
                            decInput.value = "Binaire Invalide";
                        }
                    }
                    // Cas 2 : C'est un octet binaire simple
                    else {
                        const binVal = val.replace(/[^01]/g, ''); 
                        if (binVal.length > 0 && binVal.length <= 8) {
                            decInput.value = parseInt(binVal, 2);
                        } else {
                            decInput.value = "Invalide";
                        }
                    }
                });
            }

            // --- SECTION LOGIQUE CALCULATRICE ---
            
            const calcDisplay = document.getElementById('calcDisplay');
            const calcButtons = document.querySelectorAll('.calc-button');
            let currentCalcValue = "";
            let shouldResetDisplay = false;

            if (calcButtons.length > 0) {
                calcButtons.forEach(button => {
                    button.addEventListener('click', () => {
                        const value = button.textContent;
                        
                        if (button.id === 'calcClear') {
                            currentCalcValue = "";
                            calcDisplay.value = "0";
                        } 
                        else if (button.id === 'calcBackspace') {
                            currentCalcValue = currentCalcValue.slice(0, -1);
                            if (currentCalcValue === "") calcDisplay.value = "0";
                            else calcDisplay.value = currentCalcValue;
                        } 
                        else if (button.id === 'calcEquals') {
                            if (currentCalcValue) {
                                try {
                                    let result = eval(currentCalcValue.replace(/x/g, '*').replace(/[^0-9+\-*/.]/g, ''));
                                    calcDisplay.value = result;
                                    currentCalcValue = String(result);
                                    shouldResetDisplay = true;
                                } catch (e) {
                                    calcDisplay.value = "Erreur";
                                    currentCalcValue = "";
                                    shouldResetDisplay = true;
                                }
                            }
                        } 
                        else if (button.classList.contains('op')) {
                            if (currentCalcValue && !shouldResetDisplay) {
                                currentCalcValue += button.dataset.op;
                                calcDisplay.value = currentCalcValue;
                            } else if (shouldResetDisplay) {
                                currentCalcValue += button.dataset.op;
                                calcDisplay.value = currentCalcValue;
                                shouldResetDisplay = false;
                            }
                        } 
                        else { 
                            if (shouldResetDisplay) {
                                currentCalcValue = value;
                                shouldResetDisplay = false;
                            } else {
                                if (currentCalcValue === "0") currentCalcValue = "";
                                currentCalcValue += value;
                            }
                            calcDisplay.value = currentCalcValue;
                        }
                    });
                });
            }
            
            // --- LOGIQUE GÉNÉRATEUR ACL ---
            const aclType = document.getElementById('aclType');
            const aclHostInput = document.getElementById('aclHostInput');
            const aclNetworkInput = document.getElementById('aclNetworkInput');
            const aclGenerateButton = document.getElementById('aclGenerateButton');
            const aclResult = document.getElementById('aclResult');
            
            if (aclType) {
                aclType.addEventListener('change', () => {
                    aclHostInput.style.display = (aclType.value === 'host') ? 'flex' : 'none';
                    aclNetworkInput.style.display = (aclType.value === 'network') ? 'flex' : 'none';
                });
            }
            
            if (aclGenerateButton) {
                aclGenerateButton.addEventListener('click', () => {
                    const action = document.getElementById('aclAction').value;
                    const type = aclType.value;
                    const number = document.getElementById('aclNumber').value;
                    let source = '';
                    let error = null;
                    
                    if (type === 'any') {
                        source = 'any';
                    } else if (type === 'host') {
                        const hostIp = document.getElementById('aclHostIp').value;
                        if (ipToLong(hostIp)) {
                            source = `host ${hostIp}`;
                        } else {
                            error = "IP de l'hôte invalide.";
                        }
                    } else if (type === 'network') {
                        const netIp = document.getElementById('aclNetworkIp').value;
                        const netMask = document.getElementById('aclNetworkMask').value;
                        const wildcard = maskToWildcard(netMask);
                        if (ipToLong(netIp) && wildcard) {
                            source = `${netIp} ${wildcard}`;
                        } else {
                            error = "IP Réseau ou Masque invalide.";
                        }
                    }
                    
                    aclResult.classList.remove('error');
                    if (error) {
                        aclResult.textContent = `Erreur: ${error}`;
                        aclResult.classList.add('error');
                    } else {
                        aclResult.innerHTML = `<code>access-list ${number} ${action} ${source}</code>`;
                    }
                    aclResult.style.display = 'block';
                });
            }
            });