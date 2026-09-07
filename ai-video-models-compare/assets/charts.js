(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim() || '#6366f1';
  var accent2 = style.getPropertyValue('--accent2').trim() || '#22d3ee';
  var accent3 = style.getPropertyValue('--accent3').trim() || '#f59e0b';
  var ink = style.getPropertyValue('--ink').trim() || '#e8ecf1';
  var muted = style.getPropertyValue('--muted').trim() || '#8b95a7';
  var rule = style.getPropertyValue('--rule').trim() || '#2a3142';
  var bg2 = style.getPropertyValue('--bg2').trim() || '#141820';
  var bg3 = style.getPropertyValue('--bg3').trim() || '#1c2130';

  // --- Chart 1: 价格对比柱状图 ---
  var priceChart = echarts.init(document.getElementById('chart-price'), null, { renderer: 'svg' });
  var priceModels = [
    'Wan-Fast', 'P-Video', 'Seedance Pro', 'Kling O3', 'Vidu 2.0',
    'MiniMax H3', 'Pika 2.5', 'Veo 3.1 (4s)', 'Kling 2.6 Pro',
    'Wan Pro', 'Runway Gen-4', 'Sora 2'
  ];
  var priceValues = [0.05, 0.10, 0.125, 0.15, 0.185, 0.25, 0.40, 0.32, 0.49, 0.50, 0.75, 1.00];

  function getPriceColor(val) {
    if (val <= 0.15) return '#10b981';
    if (val <= 0.40) return '#f59e0b';
    return '#ef4444';
  }

  priceChart.setOption({
    animation: false,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      backgroundColor: bg3,
      borderColor: rule,
      textStyle: { color: ink },
      formatter: function(params) {
        var d = params[0];
        return '<b>' + d.name + '</b><br/>5秒成本: $' + d.value.toFixed(3);
      }
    },
    grid: { left: 60, right: 30, top: 30, bottom: 80 },
    xAxis: {
      type: 'category',
      data: priceModels,
      axisLabel: {
        color: muted,
        rotate: 35,
        fontSize: 11
      },
      axisLine: { lineStyle: { color: rule } }
    },
    yAxis: {
      type: 'value',
      name: 'USD (5秒)',
      nameTextStyle: { color: muted, fontSize: 11 },
      axisLabel: { color: muted, formatter: '${value}' },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } },
      axisLine: { show: false }
    },
    series: [{
      type: 'bar',
      data: priceValues.map(function(v) {
        return {
          value: v,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: getPriceColor(v) },
              { offset: 1, color: getPriceColor(v) + '66' }
            ]),
            borderRadius: [4, 4, 0, 0]
          }
        };
      }),
      barWidth: '55%',
      label: {
        show: true,
        position: 'top',
        color: ink,
        fontSize: 10,
        formatter: '${c}'
      }
    }]
  });
  window.addEventListener('resize', function() { priceChart.resize(); });

  // --- Chart 2: 雷达图 ---
  var radarChart = echarts.init(document.getElementById('chart-radar'), null, { renderer: 'svg' });

  // 6个维度: 画质, 性价比, 时长上限, 功能丰富度, 生成速度, 音频支持
  var radarIndicators = [
    { name: '画质', max: 10 },
    { name: '性价比', max: 10 },
    { name: '时长上限', max: 10 },
    { name: '功能丰富度', max: 10 },
    { name: '生成速度', max: 10 },
    { name: '音频支持', max: 10 }
  ];

  var radarData = [
    {
      name: 'Seedance Pro',
      value: [6.5, 9.0, 6.0, 6.0, 7.5, 2.0],
      itemStyle: { color: '#22d3ee' },
      areaStyle: { opacity: 0.15 }
    },
    {
      name: 'MiniMax H3',
      value: [7.5, 7.0, 9.0, 5.5, 6.0, 9.5],
      itemStyle: { color: '#f59e0b' },
      areaStyle: { opacity: 0.15 }
    },
    {
      name: 'Veo 3.1',
      value: [9.0, 5.0, 5.0, 7.5, 5.5, 8.5],
      itemStyle: { color: '#ef4444' },
      areaStyle: { opacity: 0.15 }
    },
    {
      name: 'Wan Pro',
      value: [8.0, 6.0, 9.0, 8.5, 6.0, 8.0],
      itemStyle: { color: '#a855f7' },
      areaStyle: { opacity: 0.15 }
    },
    {
      name: 'Kling 2.6',
      value: [7.0, 7.5, 7.0, 8.0, 7.0, 7.0],
      itemStyle: { color: '#10b981' },
      areaStyle: { opacity: 0.15 }
    },
    {
      name: 'Runway Gen-4',
      value: [9.5, 3.5, 8.0, 9.5, 6.5, 3.0],
      itemStyle: { color: '#6366f1' },
      areaStyle: { opacity: 0.15 }
    }
  ];

  radarChart.setOption({
    animation: false,
    backgroundColor: 'transparent',
    tooltip: {
      appendToBody: true,
      backgroundColor: bg3,
      borderColor: rule,
      textStyle: { color: ink }
    },
    legend: {
      data: radarData.map(function(d) { return d.name; }),
      bottom: 0,
      textStyle: { color: muted, fontSize: 11 },
      itemWidth: 14,
      itemHeight: 8
    },
    radar: {
      indicator: radarIndicators,
      center: ['50%', '45%'],
      radius: '60%',
      axisName: { color: ink, fontSize: 12 },
      splitLine: { lineStyle: { color: rule } },
      splitArea: { areaStyle: { color: [bg2, bg3] } },
      axisLine: { lineStyle: { color: rule } }
    },
    series: [{
      type: 'radar',
      data: radarData
    }]
  });
  window.addEventListener('resize', function() { radarChart.resize(); });
})();
