import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open('insights_result.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from collections import Counter

matrix = data.get('abc_xyz_matrix', [])
reorder = data.get('reordering', [])
alerts = data.get('alerts', [])
summary = data.get('summary', {})

combined = Counter(item.get('category','') for item in matrix)
fig, axes = plt.subplots(2, 3, figsize=(18, 12))
fig.suptitle('Inventory Analysis Results', fontsize=16, fontweight='bold')

abc_cats = ['A','B','C']
xyz_cats = ['X','Y','Z']
heat_data = [[combined.get(a+x,0) for x in xyz_cats] for a in abc_cats]
im = axes[0,0].imshow(heat_data, cmap='YlOrRd', aspect='auto')
axes[0,0].set_xticks(range(3))
axes[0,0].set_xticklabels(xyz_cats, fontsize=12)
axes[0,0].set_yticks(range(3))
axes[0,0].set_yticklabels(abc_cats, fontsize=12)
axes[0,0].set_title('ABC-XYZ Matrix', fontweight='bold')
for i in range(3):
    for j in range(3):
        axes[0,0].text(j, i, str(heat_data[i][j]), ha='center', va='center', fontsize=14, fontweight='bold')
plt.colorbar(im, ax=axes[0,0])

abc_count = Counter(item.get('category','')[0] for item in matrix if item.get('category'))
axes[0,1].pie(abc_count.values(), labels=[f'{k}: {v}' for k,v in sorted(abc_count.items())],
    colors=['#2ecc71','#3498db','#e74c3c'], autopct='%1.1f%%')
axes[0,1].set_title('ABC Angilal', fontweight='bold')

xyz_count = Counter(item.get('category','')[1] for item in matrix if len(item.get('category',''))>1)
axes[0,2].pie(xyz_count.values(), labels=[f'{k}: {v}' for k,v in sorted(xyz_count.items())],
    colors=['#9b59b6','#f39c12','#1abc9c'], autopct='%1.1f%%')
axes[0,2].set_title('XYZ Angilal', fontweight='bold')

if reorder:
    top = sorted(reorder, key=lambda x: x.get('dynamicROP',0), reverse=True)[:15]
    names = [r.get('sku','')[:12] for r in top]
    rops = [r.get('dynamicROP',0) for r in top]
    bars = axes[1,0].barh(range(len(names)), rops, color='steelblue')
    axes[1,0].set_yticks(range(len(names)))
    axes[1,0].set_yticklabels(names, fontsize=7)
    axes[1,0].set_title('Top 15 Dynamic ROP', fontweight='bold')
    axes[1,0].invert_yaxis()
    for bar, val in zip(bars, rops):
        axes[1,0].text(bar.get_width()+0.5, bar.get_y()+bar.get_height()/2, str(val), va='center', fontsize=7)

if alerts:
    alert_types = Counter(a.get('type','') for a in alerts)
    colors4 = ['#e74c3c','#f39c12','#3498db','#2ecc71']
    axes[1,1].bar(range(len(alert_types)), alert_types.values(), color=colors4[:len(alert_types)])
    axes[1,1].set_xticks(range(len(alert_types)))
    axes[1,1].set_xticklabels(list(alert_types.keys()), rotation=30, ha='right', fontsize=8)
    axes[1,1].set_title('Smart Alerts', fontweight='bold')
    for i, v in enumerate(alert_types.values()):
        axes[1,1].text(i, v+0.1, str(v), ha='center', fontweight='bold')
else:
    axes[1,1].text(0.5, 0.5, 'Alert baihgui', ha='center', va='center')
    axes[1,1].set_title('Smart Alerts', fontweight='bold')

axes[1,2].axis('off')
summary_data = [
    ['Niit SKU', str(summary.get('total_products',0))],
    ['MBA durem', str(summary.get('mba_rules',0))],
    ['Active alert', str(summary.get('active_alerts',0))],
    ['Matrix SKU', str(len(matrix))],
    ['ROP tootsootoi', str(len(reorder))],
]
table = axes[1,2].table(cellText=summary_data, colLabels=['Uzuulelt','Utga'], loc='center', cellLoc='left')
table.auto_set_font_size(False)
table.set_fontsize(10)
table.scale(1.3, 2.0)
axes[1,2].set_title('Summary', fontweight='bold')

plt.tight_layout()
plt.savefig('inventory_analysis_results.png', dpi=150, bbox_inches='tight', facecolor='white')
print('Done!')