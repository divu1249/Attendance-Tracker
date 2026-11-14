import { jsPDF } from 'jspdf';
import type { RichStudyResponse } from '@/lib/aiTypes';

export interface CompiledStudyPdfResult {
  blob: Blob;
  filename: string;
  markdownText: string;
}

/**
 * Converts LaTeX / Markdown / Unicode symbols into clean, WinAnsi-safe plain text
 * for crisp multi-page PDF typography without font glyph corruption.
 */
function normalizeTextForPdf(raw: string): string {
  if (!raw) return '';

  let s = raw
    .replace(/\[(\d+)\s*\*\s*L\d+(?:-L?\d+)?\]/gi, '[$1]')
    .replace(/【(\d+)(?:†[^】]*)?】/g, '[$1]')
    .replace(/\\\\([a-zA-Z]+)/g, '\\$1')
    .replace(/\\\[/g, '')
    .replace(/\\\]/g, '')
    .replace(/\\\(/g, '')
    .replace(/\\\)/g, '')
    .replace(/\$\$/g, '')
    .replace(/\$/g, '');

  // Replace common LaTeX commands with readable WinAnsi-compatible math notation
  const replacements: Array<[RegExp, string]> = [
    [/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)'],
    [/\\dfrac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)'],
    [/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)'],
    [/\\mathbf\{([^{}]+)\}/g, '$1'],
    [/\\mathrm\{([^{}]+)\}/g, '$1'],
    [/\\text\{([^{}]+)\}/g, '$1'],
    [/\\overline\{([^{}]+)\}/g, '$1_bar'],
    [/\\left\(/g, '('],
    [/\\right\)/g, ')'],
    [/\\left\[/g, '['],
    [/\\right\]/g, ']'],
    [/\\times/g, ' x '],
    [/\\cdot/g, ' * '],
    [/\\div/g, ' / '],
    [/\\pm/g, '+/-'],
    [/\\leq|\\le/g, '<='],
    [/\\geq|\\ge/g, '>='],
    [/\\neq|\\ne/g, '!='],
    [/\\approx/g, '~='],
    [/\\equiv/g, '==='],
    [/\\rightarrow|\\to/g, ' -> '],
    [/\\leftarrow/g, ' <- '],
    [/\\Rightarrow/g, ' => '],
    [/\\infty/g, 'infinity'],
    [/\\sum/g, 'Sum'],
    [/\\prod/g, 'Product'],
    [/\\int/g, 'Integral'],
    [/\\partial/g, 'd'],
    [/\\nabla/g, 'grad'],
    [/\\alpha/g, 'alpha'],
    [/\\beta/g, 'beta'],
    [/\\gamma/g, 'gamma'],
    [/\\delta/g, 'delta'],
    [/\\Delta/g, 'Delta'],
    [/\\theta/g, 'theta'],
    [/\\lambda/g, 'lambda'],
    [/\\mu/g, 'mu'],
    [/\\pi/g, 'pi'],
    [/\\sigma/g, 'sigma'],
    [/\\Sigma/g, 'Sigma'],
    [/\\omega/g, 'omega'],
    [/\\Omega/g, 'Omega'],
    [/\\varepsilon|\\epsilon/g, 'epsilon'],
    [/\\rho/g, 'rho'],
    [/\\log/g, 'log'],
    [/\\ln/g, 'ln'],
    [/\*\*([^*]+)\*\*/g, '$1'],
    [/\*([^*\n]+)\*/g, '$1'],
    [/`([^`]+)`/g, '$1'],
    [/[≤]/g, '<='],
    [/[≥]/g, '>='],
    [/[≠]/g, '!='],
    [/[≈]/g, '~='],
    [/[→⇒]/g, ' -> '],
    [/[←]/g, ' <- '],
    [/[×]/g, ' x '],
    [/[·•]/g, '-'],
    [/[—–]/g, '-'],
    [/[“”]/g, '"'],
    [/[‘’]/g, "'"],
    [/[^\x09\x0A\x0D\x20-\xFF]/g, ''],
  ];

  for (const [pattern, replacement] of replacements) {
    s = s.replace(pattern, replacement);
  }

  return s.replace(/[ \t]{2,}/g, ' ').trim();
}

export function buildRichStudyMarkdown(study: RichStudyResponse): string {
  const lines: string[] = [];
  if (study.title) lines.push(`# ${study.title}`);
  if (study.subject_tag) lines.push(`**Subject:** ${study.subject_tag}`);
  if (study.core_intuition) {
    lines.push('', '## Core Intuition', study.core_intuition);
  }
  if (study.problem_solution?.has_solution) {
    const sol = study.problem_solution;
    lines.push('', '## Step-by-Step Solution');
    if (sol.given_parameters?.length > 0) {
      lines.push(
        '**Given:** ' + sol.given_parameters.map((g) => `${g.label} = $${g.value_latex}$`).join(', ')
      );
    }
    if (sol.key_formulas?.length > 0) {
      lines.push(
        '**Key Formulas:** ' + sol.key_formulas.map((f) => `${f.name}: $${f.latex}$`).join(' | ')
      );
    }
    (sol.steps || []).forEach((st) => {
      lines.push(`${st.step_number}. **${st.title}:** ${st.explanation}`);
      if (st.equation_latex) lines.push(`   $$${st.equation_latex}$$`);
    });
    if (sol.final_answer_latex) {
      lines.push('', `**Final Answer:** $$${sol.final_answer_latex}$$`);
    }
  }
  if (study.explanation_markdown) {
    lines.push('', study.explanation_markdown);
  }
  if (study.key_takeaways?.length > 0) {
    lines.push('', '## Key Takeaways', ...study.key_takeaways.map((k) => `- ${k}`));
  }
  if (study.exam_tips?.length > 0) {
    lines.push('', '## Exam Tips & Pitfalls', ...study.exam_tips.map((t) => `- ${t}`));
  }
  if (study.references?.length) {
    lines.push(
      '',
      '## Verified Web References',
      ...study.references.map((r) => `- [${r.title || r.domain}](${r.url})`)
    );
  }
  return lines.join('\n').trim();
}

export function compileStudyPdf(
  study: RichStudyResponse,
  subjectOverride?: string
): CompiledStudyPdfResult {
  const targetSubject = (subjectOverride || study.subject_tag || 'Study').trim();
  const safeSubject =
    targetSubject.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'Study';
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `${safeSubject}_AI_Study_Guide_${dateStr}.pdf`;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 16;
  const maxWidth = pageWidth - marginX * 2;
  const bottomLimit = pageHeight - 18;
  let y = 18;

  const ensureSpace = (neededHeight = 8) => {
    if (y + neededHeight > bottomLimit) {
      doc.addPage();
      y = 18;
    }
  };

  const writeWrappedText = (
    text: string,
    opts?: {
      fontSize?: number;
      fontStyle?: 'normal' | 'bold' | 'italic';
      fontFamily?: 'helvetica' | 'courier';
      color?: [number, number, number];
      indent?: number;
      lineGap?: number;
    }
  ) => {
    const clean = normalizeTextForPdf(text);
    if (!clean) return;
    const fontSize = opts?.fontSize ?? 10;
    const lineGap = opts?.lineGap ?? fontSize * 0.45;
    const indent = opts?.indent ?? 0;

    doc.setFont(opts?.fontFamily ?? 'helvetica', opts?.fontStyle ?? 'normal');
    doc.setFontSize(fontSize);
    const [r, g, b] = opts?.color ?? [39, 39, 42];
    doc.setTextColor(r, g, b);

    const wrapped = doc.splitTextToSize(clean, maxWidth - indent) as string[];
    wrapped.forEach((line) => {
      ensureSpace(lineGap + 2);
      doc.text(line, marginX + indent, y);
      y += lineGap;
    });
  };

  const writeSectionHeading = (title: string, accent: [number, number, number] = [37, 99, 235]) => {
    ensureSpace(12);
    y += 3;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(accent[0], accent[1], accent[2]);
    doc.text(normalizeTextForPdf(title).toUpperCase(), marginX, y);
    y += 2;
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.3);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 5;
  };

  // Document Header Banner
  doc.setFillColor(37, 99, 235);
  doc.roundedRect(marginX, y - 4, maxWidth, 22, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  const titleLines = doc.splitTextToSize(
    normalizeTextForPdf(study.title || `${targetSubject} Study Guide`),
    maxWidth - 10
  ) as string[];
  doc.text(titleLines[0] || `${targetSubject} Study Guide`, marginX + 5, y + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(219, 234, 254);
  doc.text(
    normalizeTextForPdf(`Subject: ${targetSubject}  |  Private AI Study Guide  |  ${dateStr}`),
    marginX + 5,
    y + 12
  );
  y += 25;

  // 1. Core Intuition
  if (study.core_intuition) {
    writeSectionHeading('Core Intuition');
    writeWrappedText(study.core_intuition, { fontSize: 10, color: [24, 24, 27], lineGap: 4.8 });
    y += 2;
  }

  // 2. Step-by-Step Solution
  if (study.problem_solution?.has_solution) {
    const sol = study.problem_solution;
    writeSectionHeading('Step-by-Step Derivation & Solution', [16, 185, 129]);

    if (sol.given_parameters?.length > 0) {
      writeWrappedText('Given Parameters:', { fontStyle: 'bold', fontSize: 9.5 });
      sol.given_parameters.forEach((gp) => {
        writeWrappedText(`- ${gp.label}: ${gp.value_latex}`, {
          fontSize: 9.5,
          indent: 4,
          lineGap: 4.5,
        });
      });
      y += 2;
    }

    if (sol.key_formulas?.length > 0) {
      writeWrappedText('Key Governing Formulas:', { fontStyle: 'bold', fontSize: 9.5 });
      sol.key_formulas.forEach((kf) => {
        writeWrappedText(`- ${kf.name}: ${kf.latex}`, {
          fontFamily: 'courier',
          fontSize: 9,
          indent: 4,
          color: [30, 64, 175],
          lineGap: 4.5,
        });
      });
      y += 2;
    }

    (sol.steps || []).forEach((st) => {
      ensureSpace(12);
      writeWrappedText(`Step ${st.step_number}: ${st.title}`, {
        fontStyle: 'bold',
        fontSize: 10,
        color: [24, 24, 27],
      });
      if (st.explanation) {
        writeWrappedText(st.explanation, { fontSize: 9.5, indent: 4, lineGap: 4.5 });
      }
      if (st.equation_latex) {
        writeWrappedText(`Equation: ${st.equation_latex}`, {
          fontFamily: 'courier',
          fontSize: 9.5,
          indent: 6,
          color: [37, 99, 235],
          lineGap: 4.8,
        });
      }
      y += 1.5;
    });

    if (sol.final_answer_latex) {
      ensureSpace(14);
      y += 2;
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(16, 185, 129);
      doc.roundedRect(marginX, y - 3, maxWidth, 12, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(6, 95, 70);
      const ansText = normalizeTextForPdf(`Final Answer: ${sol.final_answer_latex}`);
      const ansLines = doc.splitTextToSize(ansText, maxWidth - 8) as string[];
      doc.text(ansLines[0] || ansText, marginX + 4, y + 4);
      y += 13;
    }
  }

  // 3. Detailed Textbook Explanation
  if (study.explanation_markdown) {
    writeSectionHeading('Detailed Explanation');
    const mdLines = study.explanation_markdown.replace(/\r\n/g, '\n').split('\n');
    let inCode = false;

    for (const rawLine of mdLines) {
      const trimmed = rawLine.trim();
      if (trimmed.startsWith('```')) {
        inCode = !inCode;
        continue;
      }
      if (!trimmed) {
        y += 2;
        continue;
      }
      if (inCode) {
        writeWrappedText(rawLine, {
          fontFamily: 'courier',
          fontSize: 8.5,
          indent: 4,
          color: [15, 23, 42],
          lineGap: 4,
        });
        continue;
      }
      if (/^#{1,4}\s+/.test(trimmed)) {
        y += 1.5;
        writeWrappedText(trimmed.replace(/^#{1,4}\s+/, ''), {
          fontStyle: 'bold',
          fontSize: 10.5,
          color: [30, 64, 175],
          lineGap: 5,
        });
        continue;
      }
      if (/^[-*•]\s+/.test(trimmed)) {
        writeWrappedText(`- ${trimmed.replace(/^[-*•]\s+/, '')}`, {
          fontSize: 9.5,
          indent: 3,
          lineGap: 4.5,
        });
        continue;
      }
      if (/^\|[\s-:|]+\|$/.test(trimmed)) {
        continue;
      }
      writeWrappedText(trimmed, { fontSize: 9.5, lineGap: 4.5 });
    }
  }

  // 4. Key Takeaways
  if (Array.isArray(study.key_takeaways) && study.key_takeaways.length > 0) {
    writeSectionHeading('High-Yield Key Takeaways', [16, 185, 129]);
    study.key_takeaways.forEach((kp) => {
      writeWrappedText(`- ${kp}`, { fontSize: 9.5, indent: 3, lineGap: 4.6 });
    });
  }

  // 5. Exam Tips & Pitfalls
  if (Array.isArray(study.exam_tips) && study.exam_tips.length > 0) {
    writeSectionHeading('Exam Tips & Common Pitfalls', [217, 119, 6]);
    study.exam_tips.forEach((tip) => {
      writeWrappedText(`- ${tip}`, { fontSize: 9.5, indent: 3, lineGap: 4.6 });
    });
  }

  // 6. Verified References
  if (Array.isArray(study.references) && study.references.length > 0) {
    writeSectionHeading('Verified Web References', [82, 82, 91]);
    study.references.forEach((ref, idx) => {
      writeWrappedText(
        `${idx + 1}. ${ref.title || ref.domain || 'Reference'} — ${ref.url}`,
        {
          fontSize: 8.5,
          color: [37, 99, 235],
          indent: 2,
          lineGap: 4.2,
        }
      );
    });
  }

  // Add subtle page footers across all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(161, 161, 170);
    doc.text(
      `ShouldISkip · Private AI Study Guide (${targetSubject})`,
      marginX,
      pageHeight - 8
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX - 20, pageHeight - 8);
  }

  const blob = doc.output('blob');
  const markdownText = buildRichStudyMarkdown(study);

  return { blob, filename, markdownText };
}
