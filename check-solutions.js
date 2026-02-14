const fs = require('fs');

// Read the compiled JS file and extract the JSON data
const raw = fs.readFileSync('/home/user/Code/vibe-learn/dist/infra-go/data/module1-variants.js', 'utf8');

// Find the line that starts with "window.moduleData ="
const match = raw.match(/window\.moduleData\s*=\s*(\{[\s\S]*?\});?\s*\n/);
if (!match) {
  // Try extracting between "window.moduleData = " and the next "window." or end
  const start = raw.indexOf('window.moduleData = ');
  if (start === -1) {
    console.error('Could not find window.moduleData assignment');
    process.exit(1);
  }
  const jsonStart = raw.indexOf('{', start);
  // Find the matching closing brace by counting
  let depth = 0;
  let jsonEnd = -1;
  for (let i = jsonStart; i < raw.length; i++) {
    if (raw[i] === '{') depth++;
    else if (raw[i] === '}') {
      depth--;
      if (depth === 0) {
        jsonEnd = i;
        break;
      }
    }
  }
  var jsonStr = raw.substring(jsonStart, jsonEnd + 1);
} else {
  var jsonStr = match[1];
}

const data = JSON.parse(jsonStr);

const issues = [];

function checkSolution(solution, location) {
  if (!solution || typeof solution !== 'string') return;

  const lines = solution.split('\n');
  const localIssues = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check for tabs
    if (/\t/.test(line)) {
      localIssues.push({
        type: 'TABS',
        lineNum,
        detail: 'Line contains tab character(s)',
        line: line
      });
    }

    // Check for mixed tabs and spaces in leading whitespace
    const leading = line.match(/^(\s*)/)[1];
    if (/\t/.test(leading) && / /.test(leading)) {
      localIssues.push({
        type: 'MIXED_INDENT',
        lineNum,
        detail: 'Mixed tabs and spaces in indentation',
        line: line
      });
    }

    // Check indentation consistency: leading spaces should be a multiple of 4
    if (leading.length > 0 && !leading.includes('\t')) {
      if (leading.length % 4 !== 0) {
        localIssues.push({
          type: 'INDENT_NOT_4',
          lineNum,
          detail: `Indentation is ${leading.length} spaces (not a multiple of 4)`,
          line: line
        });
      }
    }

    // Check for lines longer than 80 characters
    if (line.length > 80) {
      localIssues.push({
        type: 'LINE_TOO_LONG',
        lineNum,
        detail: `Line is ${line.length} chars (max 80)`,
        line: line
      });
    }
  }

  if (localIssues.length > 0) {
    issues.push({ location, issues: localIssues });
  }
}

// Walk through all exercise types
const variants = data.variants;

// Warmups
if (variants.warmups) {
  for (const group of variants.warmups) {
    for (const v of group.variants) {
      checkSolution(v.solution, `warmup ${group.id} / ${v.id} "${v.title}"`);
    }
  }
}

// Challenges
if (variants.challenges) {
  for (const group of variants.challenges) {
    for (const v of group.variants) {
      checkSolution(v.solution, `challenge ${group.id} / ${v.id} "${v.title}"`);
    }
  }
}

// Scaffolds
if (variants.scaffolds) {
  for (const group of variants.scaffolds) {
    for (const v of group.variants) {
      checkSolution(v.solution, `scaffold ${group.id} / ${v.id} "${v.title}"`);
    }
  }
}

// Print report
if (issues.length === 0) {
  console.log('No formatting issues found in any solutions.');
} else {
  let totalIssues = 0;
  for (const entry of issues) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`LOCATION: ${entry.location}`);
    console.log('='.repeat(80));
    for (const iss of entry.issues) {
      totalIssues++;
      console.log(`  [${iss.type}] Line ${iss.lineNum}: ${iss.detail}`);
      console.log(`    > ${JSON.stringify(iss.line)}`);
    }
  }
  console.log(`\n${'='.repeat(80)}`);
  console.log(`SUMMARY: ${totalIssues} issue(s) across ${issues.length} solution(s)`);
  console.log('='.repeat(80));

  // Breakdown by type
  const byType = {};
  for (const entry of issues) {
    for (const iss of entry.issues) {
      byType[iss.type] = (byType[iss.type] || 0) + 1;
    }
  }
  console.log('\nBreakdown by issue type:');
  for (const [type, count] of Object.entries(byType).sort((a,b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }
}
