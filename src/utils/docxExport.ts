import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { saveAs } from 'file-saver';
import type { Itinerary } from '../types';
import { buildDestinationDirectionsUrl, buildStopDirectionsUrl } from './mapsLinks';

export async function exportItineraryToDocx(itinerary: Itinerary): Promise<void> {
  const totalStops = itinerary.days.reduce((sum, day) => sum + day.stops.length, 0);

  const children: Array<Paragraph | Table> = [
    new Paragraph({
      text: itinerary.title,
      heading: HeadingLevel.TITLE,
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [
        ...(itinerary.startingPoint
          ? [
              new TextRun({ text: 'Starting Point: ', bold: true, color: '1D4ED8' }),
              new TextRun({ text: itinerary.startingPoint }),
              new TextRun({ text: '   ·   ', color: '6B7280' }),
            ]
          : []),
        new TextRun({ text: 'Destination: ', bold: true, color: '1D4ED8' }),
        new TextRun({ text: itinerary.destination }),
        new TextRun({ text: '   ·   ', color: '6B7280' }),
        new TextRun({ text: 'Duration: ', bold: true, color: '1D4ED8' }),
        new TextRun({ text: `${itinerary.days.length} Day${itinerary.days.length === 1 ? '' : 's'}` }),
        new TextRun({ text: '   ·   ', color: '6B7280' }),
        new TextRun({ text: 'Stops: ', bold: true, color: '1D4ED8' }),
        new TextRun({ text: `${totalStops}` }),
        new TextRun({ text: '   ·   ', color: '6B7280' }),
        new TextRun({ text: 'Travel Mode: ', bold: true, color: '1D4ED8' }),
        new TextRun({ text: itinerary.travelMode }),
      ],
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Direct Navigation: ', bold: true, color: '111827', size: 19 }),
        new ExternalHyperlink({
          link: buildDestinationDirectionsUrl(itinerary.destination, itinerary.travelMode),
          children: [
            new TextRun({
              text: `Open Google Maps Directions (Current Location → ${itinerary.destination})`,
              style: 'Hyperlink',
              color: '0071E3',
              underline: {},
              size: 19,
            }),
          ],
        }),
      ],
      spacing: { after: 200 },
    }),
  ];

  if (itinerary.summary) {
    children.push(
      new Paragraph({
        text: 'Trip Overview',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 120, after: 80 },
      }),
      new Paragraph({
        text: itinerary.summary,
        spacing: { after: 240 },
      })
    );
  }

  for (const day of itinerary.days) {
    children.push(
      new Paragraph({
        text: `Day ${day.dayNumber}: ${day.title}`,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 320, after: 60 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: day.theme,
            italics: true,
            color: '4B5563',
          }),
        ],
        spacing: { after: 140 },
      })
    );

    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        createHeaderCell('Time & Duration', 18),
        createHeaderCell('Landmark & Verified Location', 32),
        createHeaderCell('Overview & Practical Notes', 50),
      ],
    });

    const dataRows = day.stops.map((stop, idx) => {
      const shade = idx % 2 === 1 ? 'F8F9FA' : 'FFFFFF';
      return new TableRow({
        children: [
          new TableCell({
            width: { size: 18, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: shade },
            margins: { top: 100, bottom: 100, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [new TextRun({ text: stop.timeSlot || 'Flexible', bold: true })],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${stop.durationMinutes} min`,
                    color: '4B5563',
                    size: 18,
                  }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: stop.estimatedCost || '',
                    color: '1D4ED8',
                    size: 18,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 32, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: shade },
            margins: { top: 100, bottom: 100, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [new TextRun({ text: `${idx + 1}. ${stop.name}`, bold: true })],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: stop.category,
                    color: '4B5563',
                    size: 18,
                  }),
                ],
              }),
              ...(stop.formattedAddress
                ? [
                    new Paragraph({
                      spacing: { before: 40 },
                      children: [
                        new TextRun({
                          text: stop.formattedAddress,
                          color: '6B7280',
                          size: 18,
                        }),
                      ],
                    }),
                  ]
                : []),
              new Paragraph({
                spacing: { before: 60 },
                children: [
                  new ExternalHyperlink({
                    link: buildStopDirectionsUrl(stop, itinerary.destination, itinerary.travelMode),
                    children: [
                      new TextRun({
                        text: 'Directions from Current Location ↗',
                        style: 'Hyperlink',
                        color: '0071E3',
                        underline: {},
                        size: 17,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: shade },
            margins: { top: 100, bottom: 100, left: 120, right: 120 },
            children: [
              new Paragraph({
                text: stop.description || 'Explore this landmark at your own pace.',
              }),
              ...(stop.visitingTips
                ? [
                    new Paragraph({
                      spacing: { before: 60 },
                      children: [
                        new TextRun({ text: 'Visitor Tip: ', bold: true, color: '111827', size: 19 }),
                        new TextRun({ text: stop.visitingTips, color: '374151', size: 19 }),
                      ],
                    }),
                  ]
                : []),
            ],
          }),
        ],
      });
    });

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
          left: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
          right: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB' },
          insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB' },
        },
        rows: [headerRow, ...dataRows],
      })
    );
  }

  if (itinerary.sources && itinerary.sources.length > 0) {
    children.push(
      new Paragraph({
        text: 'Research Sources & References',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 360, after: 100 },
      }),
      ...itinerary.sources.map(
        (source, i) =>
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({ text: `${i + 1}. ${source.title} — `, bold: true, size: 18 }),
              new TextRun({ text: source.uri, color: '1D4ED8', size: 18 }),
            ],
          })
      )
    );
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 320 },
      children: [
        new TextRun({
          text: `Prepared with Wayfarer Atlas · ${new Date().toLocaleDateString()}`,
          italics: true,
          color: '6B7280',
          size: 18,
        }),
      ],
    })
  );

  const doc = new Document({
    creator: 'Wayfarer Atlas',
    title: itinerary.title,
    description: `Day-by-day travel itinerary for ${itinerary.destination}`,
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  const safeFilename = (itinerary.title || itinerary.destination || 'wayfarer-itinerary')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  saveAs(blob, `${safeFilename || 'wayfarer-itinerary'}.docx`);
}

function createHeaderCell(label: string, widthPercent: number): TableCell {
  return new TableCell({
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, fill: '1E3A8A' },
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: label,
            bold: true,
            color: 'FFFFFF',
            size: 20,
          }),
        ],
      }),
    ],
  });
}
