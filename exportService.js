const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  PageBreak,
  ShadingType,
  VerticalAlign
} = require('docx');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');

// Dosya adı için güvenli Türkçe/ASCII dönüşümü (Örn: Satranç_Kulubu_Ogrenci_Listesi.docx)
function sanitizeFileName(clubName) {
  if (!clubName) return 'Kulup_Ogrenci_Listesi';
  // Kullanıcının istediği örnek: Satranç_Kulubu_Ogrenci_Listesi.docx
  // Hem okunaklı hem dosya sistemine uygun hale getirelim:
  let cleaned = String(clubName).trim();
  // Küçük/büyük kelime düzeni: "SATRANÇ KULÜBÜ" -> "Satranç_Kulubu"
  const words = cleaned.split(/\s+/).map((w) => {
    const lower = w.toLocaleLowerCase('tr-TR');
    return lower.charAt(0).toLocaleUpperCase('tr-TR') + lower.slice(1);
  });
  cleaned = words.join('_');
  // Dosya sisteminde yasaklı karakterleri temizle
  cleaned = cleaned
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'U')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'O')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'G')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 'S')
    .replace(/[\\/:*?"<>|]/g, '');
  return `${cleaned}_Ogrenci_Listesi`;
}

// Windows / Linux / macOS Türkçe karakter destekli TrueType font bulucu
function getTurkishFontPaths() {
  const candidatesRegular = [
    'C:\\Windows\\Fonts\\arial.ttf',
    'C:\\Windows\\Fonts\\segoeui.ttf',
    'C:\\Windows\\Fonts\\tahoma.ttf',
    'C:\\Windows\\Fonts\\calibri.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/System/Library/Fonts/Supplemental/Arial.ttf'
  ];
  const candidatesBold = [
    'C:\\Windows\\Fonts\\arialbd.ttf',
    'C:\\Windows\\Fonts\\segoeuib.ttf',
    'C:\\Windows\\Fonts\\tahomabd.ttf',
    'C:\\Windows\\Fonts\\calibrib.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
  ];

  const regular = candidatesRegular.find((p) => fs.existsSync(p)) || null;
  const bold = candidatesBold.find((p) => fs.existsSync(p)) || regular;
  return { regular, bold };
}

// Word tablo kenarlık stili
const tableBorders = {
  top: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
  left: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
  right: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
  insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' }
};

function createClubWordSectionChildren({ schoolName, academicYear, club, students, includePageBreakBefore = false }) {
  const children = [];

  if (includePageBreakBefore) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // OKUL ADI
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: (schoolName || 'CUMHURİYET ORTAOKULU').toLocaleUpperCase('tr-TR'),
          bold: true,
          size: 28,
          font: 'Arial',
          color: '0F172A'
        })
      ]
    })
  );

  // ÖĞRENCİ KULÜP LİSTESİ
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: `${academicYear ? academicYear + ' - ' : ''}ÖĞRENCİ KULÜP LİSTESİ`,
          bold: true,
          size: 24,
          font: 'Arial',
          color: '1E3A8A'
        })
      ]
    })
  );

  // Kulüp: Satranç Kulübü
  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 120, after: 80 },
      children: [
        new TextRun({
          text: 'Kulüp: ',
          bold: true,
          size: 22,
          font: 'Arial',
          color: '334155'
        }),
        new TextRun({
          text: club.name,
          bold: true,
          size: 22,
          font: 'Arial',
          color: '0F172A'
        }),
        new TextRun({
          text: `   (Kayıtlı Öğrenci: ${students.length} / Kontenjan: ${club.quota})`,
          size: 20,
          font: 'Arial',
          color: '475569'
        })
      ]
    })
  );

  if (club.teacher) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 160 },
        children: [
          new TextRun({
            text: `Danışman Öğretmen: ${club.teacher}`,
            size: 20,
            font: 'Arial',
            color: '475569'
          })
        ]
      })
    );
  }

  // Tablo Başlığı: | Sıra | Ad Soyad | Sınıf | Öğrenci No |
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      { text: 'Sıra', width: 12, align: AlignmentType.CENTER },
      { text: 'Ad Soyad', width: 48, align: AlignmentType.LEFT },
      { text: 'Sınıf', width: 20, align: AlignmentType.CENTER },
      { text: 'Öğrenci No', width: 20, align: AlignmentType.CENTER }
    ].map(
      (col) =>
        new TableCell({
          width: { size: col.width, type: WidthType.PERCENTAGE },
          shading: { fill: '1E3A8A', type: ShadingType.CLEAR, color: 'auto' },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 100, bottom: 100, left: 120, right: 120 },
          children: [
            new Paragraph({
              alignment: col.align,
              children: [
                new TextRun({
                  text: col.text,
                  bold: true,
                  size: 20,
                  font: 'Arial',
                  color: 'FFFFFF'
                })
              ]
            })
          ]
        })
    )
  });

  const dataRows =
    students.length > 0
      ? students.map((st, idx) => {
          const fill = idx % 2 === 1 ? 'F8FAFC' : 'FFFFFF';
          const fullName = `${st.firstName || ''} ${st.lastName || ''}`.trim();
          return new TableRow({
            children: [
              { text: String(idx + 1), align: AlignmentType.CENTER },
              { text: fullName, align: AlignmentType.LEFT },
              { text: String(st.className || ''), align: AlignmentType.CENTER },
              { text: String(st.studentNo || ''), align: AlignmentType.CENTER }
            ].map(
              (cell) =>
                new TableCell({
                  shading: { fill, type: ShadingType.CLEAR, color: 'auto' },
                  verticalAlign: VerticalAlign.CENTER,
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      alignment: cell.align,
                      children: [
                        new TextRun({
                          text: cell.text,
                          size: 20,
                          font: 'Arial',
                          color: '1E293B'
                        })
                      ]
                    })
                  ]
                })
            )
          });
        })
      : [
          new TableRow({
            children: [
              new TableCell({
                columnSpan: 4,
                margins: { top: 140, bottom: 140, left: 120, right: 120 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new TextRun({
                        text: 'Bu kulübü henüz seçen öğrenci bulunmamaktadır.',
                        italics: true,
                        size: 20,
                        font: 'Arial',
                        color: '64748B'
                      })
                    ]
                  })
                ]
              })
            ]
          })
        ];

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [headerRow, ...dataRows]
  });

  children.push(table);

  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 240, after: 100 },
      children: [
        new TextRun({
          text: `Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')}`,
          size: 18,
          font: 'Arial',
          color: '64748B'
        })
      ]
    })
  );

  return children;
}

// 1. Tek Kulüp Word (.docx) Oluşturma
async function generateClubDocx({ schoolName, academicYear, club, students }) {
  const children = createClubWordSectionChildren({
    schoolName,
    academicYear,
    club,
    students,
    includePageBreakBefore: false
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children
      }
    ]
  });

  return Packer.toBuffer(doc);
}

// 2. Tüm Kulüpleri Tek Word (.docx) Dosyasına Aktarma
async function generateAllClubsDocx({ schoolName, academicYear, clubsWithStudents }) {
  const allChildren = [];

  clubsWithStudents.forEach((item, index) => {
    const sectionItems = createClubWordSectionChildren({
      schoolName,
      academicYear,
      club: item.club,
      students: item.students,
      includePageBreakBefore: index > 0
    });
    allChildren.push(...sectionItems);
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: allChildren
      }
    ]
  });

  return Packer.toBuffer(doc);
}

// 3. Genel Rapor Word (.docx) Oluşturma
async function generateGenericReportDocx({ schoolName, academicYear, reportTitle, subtitle, headers, rows }) {
  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: (schoolName || 'CUMHURİYET ORTAOKULU').toLocaleUpperCase('tr-TR'),
          bold: true,
          size: 28,
          font: 'Arial',
          color: '0F172A'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: reportTitle,
          bold: true,
          size: 24,
          font: 'Arial',
          color: '1E3A8A'
        })
      ]
    })
  ];

  if (subtitle) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 180 },
        children: [
          new TextRun({
            text: subtitle,
            size: 20,
            font: 'Arial',
            color: '475569'
          })
        ]
      })
    );
  }

  const colWidth = Math.floor(100 / Math.max(1, headers.length));
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (h) =>
        new TableCell({
          width: { size: colWidth, type: WidthType.PERCENTAGE },
          shading: { fill: '1E3A8A', type: ShadingType.CLEAR, color: 'auto' },
          margins: { top: 90, bottom: 90, left: 100, right: 100 },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: String(h),
                  bold: true,
                  size: 19,
                  font: 'Arial',
                  color: 'FFFFFF'
                })
              ]
            })
          ]
        })
    )
  });

  const dataRows = rows.map((r, idx) => {
    const fill = idx % 2 === 1 ? 'F8FAFC' : 'FFFFFF';
    return new TableRow({
      children: r.map(
        (val, cIdx) =>
          new TableCell({
            shading: { fill, type: ShadingType.CLEAR, color: 'auto' },
            margins: { top: 75, bottom: 75, left: 100, right: 100 },
            children: [
              new Paragraph({
                alignment: cIdx === 1 ? AlignmentType.LEFT : AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: String(val ?? ''),
                    size: 19,
                    font: 'Arial',
                    color: '1E293B'
                  })
                ]
              })
            ]
          })
      )
    });
  });

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorders,
      rows: [headerRow, ...dataRows]
    })
  );

  const doc = new Document({
    sections: [{ properties: {}, children }]
  });

  return Packer.toBuffer(doc);
}

// PDF Çizim Yardımcıları (A4 Boyutunda: 595.28 x 841.89 pt)
function renderClubPageOnPdf(doc, { schoolName, academicYear, club, students, fontRegular, fontBold }) {
  const pageWidth = 595.28;
  const margin = 45;
  const contentWidth = pageWidth - margin * 2;

  // Başlık: OKUL ADI
  doc
    .font(fontBold)
    .fontSize(15)
    .fillColor('#0F172A')
    .text((schoolName || 'CUMHURİYET ORTAOKULU').toLocaleUpperCase('tr-TR'), margin, 45, {
      align: 'center',
      width: contentWidth
    });

  // Alt Başlık: ÖĞRENCİ KULÜP LİSTESİ
  doc
    .font(fontBold)
    .fontSize(12)
    .fillColor('#1E3A8A')
    .text(`${academicYear ? academicYear + ' - ' : ''}ÖĞRENCİ KULÜP LİSTESİ`, margin, 66, {
      align: 'center',
      width: contentWidth
    });

  // Kulüp Bilgi Kutusu
  const boxTop = 92;
  doc
    .roundedRect(margin, boxTop, contentWidth, 38, 4)
    .fillAndStroke('#F1F5F9', '#CBD5E1');

  doc
    .font(fontBold)
    .fontSize(11)
    .fillColor('#0F172A')
    .text(`Kulüp: ${club.name}`, margin + 12, boxTop + 12);

  doc
    .font(fontRegular)
    .fontSize(10)
    .fillColor('#334155')
    .text(
      `Kayıtlı Öğrenci: ${students.length} / Kontenjan: ${club.quota}`,
      margin,
      boxTop + 12,
      { align: 'right', width: contentWidth - 12 }
    );

  // Tablo kolon genişlikleri: Sıra (50), Ad Soyad (255), Sınıf (100), Öğrenci No (100) => Toplam 505.28
  const colWidths = [50, 255, 100, 100.28];
  const colHeaders = ['Sıra', 'Ad Soyad', 'Sınıf', 'Öğrenci No'];
  let y = boxTop + 50;

  const drawTableHeader = (topY) => {
    doc.rect(margin, topY, contentWidth, 24).fill('#1E3A8A');
    let x = margin;
    colHeaders.forEach((h, i) => {
      doc
        .font(fontBold)
        .fontSize(10)
        .fillColor('#FFFFFF')
        .text(h, x + 6, topY + 7, {
          width: colWidths[i] - 12,
          align: i === 1 ? 'left' : 'center'
        });
      x += colWidths[i];
    });
    return topY + 24;
  };

  y = drawTableHeader(y);

  if (students.length === 0) {
    doc.rect(margin, y, contentWidth, 30).stroke('#CBD5E1');
    doc
      .font(fontRegular)
      .fontSize(10)
      .fillColor('#64748B')
      .text('Bu kulübü henüz seçen öğrenci bulunmamaktadır.', margin, y + 10, {
        width: contentWidth,
        align: 'center'
      });
    y += 30;
  } else {
    students.forEach((st, idx) => {
      if (y + 22 > 770) {
        doc.addPage({ size: 'A4', margin: 45 });
        y = 45;
        y = drawTableHeader(y);
      }

      const rowHeight = 22;
      const bg = idx % 2 === 1 ? '#F8FAFC' : '#FFFFFF';
      doc.rect(margin, y, contentWidth, rowHeight).fillAndStroke(bg, '#CBD5E1');

      const fullName = `${st.firstName || ''} ${st.lastName || ''}`.trim();
      const rowValues = [
        String(idx + 1),
        fullName,
        String(st.className || ''),
        String(st.studentNo || '')
      ];

      let x = margin;
      rowValues.forEach((val, i) => {
        // Dikey çizgiler
        if (i > 0) {
          doc
            .moveTo(x, y)
            .lineTo(x, y + rowHeight)
            .strokeColor('#E2E8F0')
            .stroke();
        }
        doc
          .font(fontRegular)
          .fontSize(10)
          .fillColor('#1E293B')
          .text(val, x + 6, y + 6, {
            width: colWidths[i] - 12,
            align: i === 1 ? 'left' : 'center',
            lineBreak: false
          });
        x += colWidths[i];
      });

      y += rowHeight;
    });
  }

  // Alt bilgi ve imza alanı
  if (y + 60 < 790) {
    doc
      .font(fontRegular)
      .fontSize(9)
      .fillColor('#64748B')
      .text(`Oluşturulma Tarihi: ${new Date().toLocaleDateString('tr-TR')}`, margin, y + 16);

    doc
      .font(fontBold)
      .fontSize(9)
      .fillColor('#334155')
      .text('Okul Yönetimi Onayı', margin, y + 16, {
        width: contentWidth,
        align: 'right'
      });
  }
}

// 4. Tek Kulüp PDF (.pdf) Oluşturma
function generateClubPdf({ schoolName, academicYear, club, students }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 45 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const fonts = getTurkishFontPaths();
      let fontRegular = 'Helvetica';
      let fontBold = 'Helvetica-Bold';
      if (fonts.regular) {
        doc.registerFont('TrRegular', fonts.regular);
        fontRegular = 'TrRegular';
      }
      if (fonts.bold) {
        doc.registerFont('TrBold', fonts.bold);
        fontBold = 'TrBold';
      }

      renderClubPageOnPdf(doc, {
        schoolName,
        academicYear,
        club,
        students,
        fontRegular,
        fontBold
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// 5. Tüm Kulüpleri Tek PDF (.pdf) Dosyasına Aktarma
function generateAllClubsPdf({ schoolName, academicYear, clubsWithStudents }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 45 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const fonts = getTurkishFontPaths();
      let fontRegular = 'Helvetica';
      let fontBold = 'Helvetica-Bold';
      if (fonts.regular) {
        doc.registerFont('TrRegular', fonts.regular);
        fontRegular = 'TrRegular';
      }
      if (fonts.bold) {
        doc.registerFont('TrBold', fonts.bold);
        fontBold = 'TrBold';
      }

      clubsWithStudents.forEach((item, index) => {
        if (index > 0) {
          doc.addPage({ size: 'A4', margin: 45 });
        }
        renderClubPageOnPdf(doc, {
          schoolName,
          academicYear,
          club: item.club,
          students: item.students,
          fontRegular,
          fontBold
        });
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// 6. Genel Rapor PDF Oluşturma
function generateGenericReportPdf({ schoolName, academicYear, reportTitle, subtitle, headers, rows }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const fonts = getTurkishFontPaths();
      let fontRegular = 'Helvetica';
      let fontBold = 'Helvetica-Bold';
      if (fonts.regular) {
        doc.registerFont('TrRegular', fonts.regular);
        fontRegular = 'TrRegular';
      }
      if (fonts.bold) {
        doc.registerFont('TrBold', fonts.bold);
        fontBold = 'TrBold';
      }

      const pageWidth = 595.28;
      const margin = 40;
      const contentWidth = pageWidth - margin * 2;

      doc
        .font(fontBold)
        .fontSize(14)
        .fillColor('#0F172A')
        .text((schoolName || 'CUMHURİYET ORTAOKULU').toLocaleUpperCase('tr-TR'), margin, 40, {
          align: 'center',
          width: contentWidth
        });

      doc
        .font(fontBold)
        .fontSize(12)
        .fillColor('#1E3A8A')
        .text(reportTitle, margin, 60, {
          align: 'center',
          width: contentWidth
        });

      if (subtitle) {
        doc
          .font(fontRegular)
          .fontSize(9.5)
          .fillColor('#475569')
          .text(subtitle, margin, 78, {
            align: 'center',
            width: contentWidth
          });
      }

      let y = subtitle ? 100 : 85;
      const colCount = Math.max(1, headers.length);
      const colWidths = headers.map((_, idx) => {
        if (idx === 0 && headers[0] === 'Sıra') return 40;
        return (contentWidth - (headers[0] === 'Sıra' ? 40 : 0)) / (headers[0] === 'Sıra' ? colCount - 1 : colCount);
      });

      const drawHeader = (topY) => {
        doc.rect(margin, topY, contentWidth, 24).fill('#1E3A8A');
        let x = margin;
        headers.forEach((h, i) => {
          doc
            .font(fontBold)
            .fontSize(9)
            .fillColor('#FFFFFF')
            .text(String(h), x + 4, topY + 7, {
              width: colWidths[i] - 8,
              align: i === 1 ? 'left' : 'center',
              lineBreak: false
            });
          x += colWidths[i];
        });
        return topY + 24;
      };

      y = drawHeader(y);

      rows.forEach((r, idx) => {
        if (y + 20 > 780) {
          doc.addPage({ size: 'A4', margin: 40 });
          y = 40;
          y = drawHeader(y);
        }
        const rowH = 20;
        const bg = idx % 2 === 1 ? '#F8FAFC' : '#FFFFFF';
        doc.rect(margin, y, contentWidth, rowH).fillAndStroke(bg, '#CBD5E1');
        let x = margin;
        r.forEach((val, i) => {
          doc
            .font(fontRegular)
            .fontSize(9)
            .fillColor('#1E293B')
            .text(String(val ?? ''), x + 4, y + 5, {
              width: (colWidths[i] || 80) - 8,
              align: i === 1 ? 'left' : 'center',
              lineBreak: false
            });
          x += colWidths[i] || 80;
        });
        y += rowH;
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// 7. Örnek Öğrenci Listesi Excel (.xlsx) Şablonu Oluşturma
function generateStudentTemplateXlsx(students = []) {
  const rows =
    students.length > 0
      ? students.map((s) => ({
          Ad: s.firstName,
          Soyad: s.lastName,
          Sınıf: s.className,
          'Öğrenci No': s.studentNo
        }))
      : [
          { Ad: 'Ahmet', Soyad: 'Yılmaz', Sınıf: '6A', 'Öğrenci No': '15' },
          { Ad: 'Ayşe', Soyad: 'Demir', Sınıf: '6B', 'Öğrenci No': '21' },
          { Ad: 'Mehmet', Soyad: 'Kaya', Sınıf: '7A', 'Öğrenci No': '8' }
        ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Ogrenci_Listesi');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  sanitizeFileName,
  generateClubDocx,
  generateAllClubsDocx,
  generateGenericReportDocx,
  generateClubPdf,
  generateAllClubsPdf,
  generateGenericReportPdf,
  generateStudentTemplateXlsx
};
